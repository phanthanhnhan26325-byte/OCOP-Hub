import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/app/api/orders/[id]/actions/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const orderId = '00000000-0000-4000-8000-000000000001';
const customerId = '00000000-0000-4000-8000-000000000002';

function setup(options = {}) {
  const calls = [];
  const module = { exports: {} };
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    zod: require('zod'),
    '@/lib/rbac': {
      async requireRole() {
        if (options.denied) throw new Error('Access denied');
        return { id: customerId };
      },
      handleApiError: () => Response.json({ error: { message: 'Không lưu được đơn hàng.' } }, { status: 500 }),
    },
    '@/lib/supabase/admin': {
      supabaseAdmin: () => ({
        async rpc(name, args) {
          calls.push({ name, args });
          return options.rpcError
            ? { data: null, error: options.rpcError }
            : { data: { ok: true, status: args.p_action === 'COMPLETE' ? 'COMPLETED' : 'CANCELLED' }, error: null };
        },
      }),
    },
  };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: name => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
    },
  });
  return {
    calls,
    async post(id = orderId, body = { action: 'COMPLETE' }) {
      return module.exports.POST({ json: async () => body }, { params: Promise.resolve({ id }) });
    },
  };
}

test('customer completion uses the authenticated customer and target child order', async () => {
  const { calls, post } = setup();
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'customer_update_order');
  assert.equal(calls[0].args.p_customer, customerId);
  assert.equal(calls[0].args.p_order, orderId);
  assert.equal(calls[0].args.p_action, 'COMPLETE');
  assert.equal(calls[0].args.p_reason, null);
  assert.equal(calls[0].args.p_evidence_path, null);
  assert.equal(calls[0].args.p_contact_phone, null);
});

test('invalid actions and order IDs never call the privileged workflow', async () => {
  const { calls, post } = setup();
  assert.equal((await post(orderId, { action: 'COMPLETED' })).status, 400);
  assert.equal((await post('not-a-uuid')).status, 400);
  assert.equal(calls.length, 0);
});

test('unauthorized customers and database errors do not return success', async () => {
  const unauthorized = setup({ denied: true });
  assert.equal((await unauthorized.post()).status, 500);
  assert.equal(unauthorized.calls.length, 0);

  const failed = setup({ rpcError: { message: 'ORDER_STATE_INVALID: not delivered' } });
  const response = await failed.post();
  assert.equal(response.status, 500);
  assert.equal(failed.calls.length, 1);
});
