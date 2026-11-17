import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/app/api/workshops/registrations/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sessionId = '00000000-0000-4000-8000-000000000001';
const registrationId = '00000000-0000-4000-8000-000000000002';
const customerId = '00000000-0000-4000-8000-000000000003';

function setup(status = 'PENDING') {
  const calls = { payment: null, transaction: null };
  const registration = {
    id: registrationId,
    code: 'WS000001',
    amount: 200000,
    status,
    hold_expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const supabase = {
    from(table) {
      if (table === 'workshop_registrations') {
        const query = {
          select() { return this; },
          eq() { return this; },
          in() { return this; },
          async maybeSingle() { return { data: registration, error: null }; },
        };
        return query;
      }
      if (table === 'payment_transactions') {
        return {
          async insert(value) {
            calls.transaction = value;
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  const mockModule = { exports: {} };
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    zod: require('zod'),
    '@/lib/rbac': {
      async requireAuth() { return { id: customerId }; },
      handleApiError: () => Response.json({ error: { code: 'UNEXPECTED' } }, { status: 500 }),
    },
    '@/lib/supabase/server': { supabaseServer: async () => supabase },
    '@/lib/supabase/admin': {
      supabaseAdmin: () => ({
        async rpc() { return { data: null, error: { message: 'ALREADY_REGISTERED' } }; },
      }),
    },
    '@/modules/orders/checkout.service': {
      async ensurePayment(input) {
        calls.payment = input;
        return { id: '00000000-0000-4000-8000-000000000004', provider: 'mock' };
      },
    },
    '@/modules/payments/providers': {
      getProvider: () => ({
        name: 'mock',
        async create() {
          return { providerTxnId: 'MOCK-TXN', redirectUrl: 'http://localhost:3000/pay/mock/payment' };
        },
      }),
    },
    '@/lib/env': { env: { APP_URL: 'http://localhost:3000' } },
  };
  vm.runInNewContext(compiled, {
    module: mockModule,
    exports: mockModule.exports,
    require: name => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    },
  });
  return {
    calls,
    async post() {
      return mockModule.exports.POST({ json: async () => ({ sessionId }) });
    },
  };
}

test('existing pending registration reuses its payment instead of failing as a duplicate', async () => {
  const { calls, post } = setup();
  const response = await post();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.registrationId, registrationId);
  assert.equal(body.redirectUrl, 'http://localhost:3000/pay/mock/payment');
  assert.equal(calls.payment.referenceId, registrationId);
  assert.equal(calls.transaction.status, 'CREATED');
});

test('existing confirmed registration returns a clear already-registered response', async () => {
  const { calls, post } = setup('CONFIRMED');
  const response = await post();
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error.code, 'ALREADY_REGISTERED');
  assert.match(body.error.message, /đã đăng ký/i);
  assert.equal(calls.payment, null);
});
