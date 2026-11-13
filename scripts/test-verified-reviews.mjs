import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/app/api/reviews/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  target: '00000000-0000-4000-8000-000000000002',
  purchase: '00000000-0000-4000-8000-000000000003',
  review: '00000000-0000-4000-8000-000000000004',
};

function setup({ eligible = true } = {}) {
  const calls = [];
  const review = {
    id: ids.review,
    product_id: ids.target,
    workshop_id: ids.target,
    display_name: 'N*** V*** A***',
    rating: 5,
    comment: 'Rất tốt',
    created_at: '2026-11-07T00:00:00.000Z',
    updated_at: '2026-11-07T00:00:00.000Z',
  };
  const admin = {
    from(table) {
      calls.push({ table, operation: 'from' });
      return {
        select() { return this; },
        eq(column, value) { calls.push({ table, column, value }); return this; },
        in(column, values) { calls.push({ table, column, values }); return this; },
        maybeSingle: async () => ({
          data: eligible ? { id: ids.purchase, product_id: ids.target } : null,
          error: null,
        }),
        single: async () => ({
          data: table === 'users' ? { full_name: 'Nguyen Van A' } : review,
          error: null,
        }),
        upsert(values, options) {
          calls.push({ table, operation: 'upsert', values, options });
          return this;
        },
      };
    },
  };
  const testModule = { exports: {} };
  const mocks = {
    'next/server': {
      NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) },
    },
    zod: require('zod'),
    '@/lib/rbac': {
      handleApiError: (error) => ({ status: 500, body: { error: error.message } }),
      requireRole: async () => ({ id: ids.user }),
    },
    '@/lib/supabase/admin': { supabaseAdmin: () => admin },
  };
  vm.runInNewContext(compiled, {
    module: testModule,
    exports: testModule.exports,
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
      return mocks[name];
    },
  });
  return { post: testModule.exports.POST, calls };
}

function request(body) {
  return { json: async () => body };
}

test('product review requires a delivered or completed purchase and stores a masked display name', async () => {
  const { post, calls } = setup();
  const response = await post(request({
    type: 'product', targetId: ids.target, purchaseId: ids.purchase, rating: 5, comment: 'Rất tốt',
  }));
  assert.equal(response.status, 200);
  assert.equal(response.body.review.display_name, 'N*** V*** A***');
  assert.ok(calls.some((call) => call.table === 'order_items' && call.column === 'orders.order_level' && call.value === 'CHILD'));
  assert.ok(calls.some((call) => call.table === 'order_items' && call.column === 'orders.status' && call.values.includes('DELIVERED')));
  const save = calls.find((call) => call.table === 'product_reviews' && call.operation === 'upsert');
  assert.equal(save.values.customer_id, ids.user);
  assert.equal(save.options.onConflict, 'order_item_id');
});

test('workshop review requires a completed registration', async () => {
  const { post, calls } = setup();
  const response = await post(request({
    type: 'workshop', targetId: ids.target, purchaseId: ids.purchase, rating: 4, comment: '',
  }));
  assert.equal(response.status, 200);
  assert.ok(calls.some((call) => call.table === 'workshop_registrations' && call.column === 'status' && call.value === 'COMPLETED'));
  assert.equal(calls.find((call) => call.table === 'workshop_reviews' && call.operation === 'upsert').options.onConflict, 'registration_id');
});

test('review rejects a purchase that is not eligible', async () => {
  const { post } = setup({ eligible: false });
  const response = await post(request({
    type: 'product', targetId: ids.target, purchaseId: ids.purchase, rating: 5, comment: '',
  }));
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'REVIEW_NOT_ELIGIBLE');
});

test('review rejects invalid rating and malformed JSON', async () => {
  const { post, calls } = setup();
  const invalidRating = await post(request({
    type: 'product', targetId: ids.target, purchaseId: ids.purchase, rating: 6, comment: '',
  }));
  assert.equal(invalidRating.status, 400);
  const invalidJson = await post({ json: async () => { throw new Error('invalid JSON'); } });
  assert.equal(invalidJson.status, 400);
  assert.equal(calls.some((call) => call.operation === 'upsert'), false);
});
