import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/app/api/partner/orders/[id]/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const orderId = '00000000-0000-4000-8000-000000000001';
const partnerId = '00000000-0000-4000-8000-000000000002';

function setup(options = {}) {
  const calls = { writes: [], history: [], privilegedClients: 0 };
  const order = { id: orderId, partner_id: partnerId, status: 'PENDING_ACCEPTANCE', order_level: 'CHILD', parent_order_id: 'parent', ...options.order };
  const read = {
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: options.notFound ? null : order, error: options.readError ?? null }; },
  };
  const admin = {
    from(table) {
      if (table === 'order_status_history') return {
        async insert(value) { calls.history.push(value); return { error: options.historyError ?? null }; },
      };
      const filters = [];
      return {
        update(value) { calls.writes.push({ value, filters }); return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        select() { return this; },
        async maybeSingle() { return { data: options.conflict || options.writeError ? null : { id: orderId, status: calls.writes[0].value.status }, error: options.writeError ?? null }; },
      };
    },
  };
  const module = { exports: {} };
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    zod: require('zod'),
    '@/lib/rbac': {
      async requireApprovedPartner() { if (options.denied) throw new Error('Access denied'); return { id: partnerId }; },
      handleApiError: () => Response.json({ error: { message: 'Không lưu được đơn hàng.' } }, { status: 500 }),
    },
    '@/lib/supabase/server': { supabaseServer: async () => ({ from: () => read }) },
    '@/lib/supabase/admin': { supabaseAdmin: () => { calls.privilegedClients++; return admin; } },
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
    return modules[name];
  }, console: { error() {} } });
  return {
    calls,
    async patch(body = { toStatus: 'ACCEPTED' }) {
      return module.exports.PATCH({ json: async () => body }, { params: Promise.resolve({ id: orderId }) });
    },
  };
}

test('accept saves with partner, child-order and prior-state guards, then records history', async () => {
  const { calls, patch } = setup();
  const response = await patch();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ACCEPTED');
  assert.equal(calls.writes.length, 1);
  assert.deepEqual(calls.writes[0].filters, [['id', orderId], ['partner_id', partnerId], ['order_level', 'CHILD'], ['status', 'PENDING_ACCEPTANCE']]);
  assert.equal(calls.history[0].from_status, 'PENDING_ACCEPTANCE');
  assert.equal(calls.history[0].to_status, 'ACCEPTED');
  assert.equal(calls.history[0].actor_id, partnerId);
});

test('another partner, parent order, missing order and invalid transition cannot write', async () => {
  for (const [options, expected] of [
    [{ order: { partner_id: 'someone-else' } }, 403],
    [{ order: { order_level: 'PARENT' } }, 404],
    [{ notFound: true }, 404],
    [{ order: { status: 'COMPLETED' } }, 409],
  ]) {
    const { calls, patch } = setup(options);
    assert.equal((await patch()).status, expected);
    assert.equal(calls.privilegedClients, 0);
    assert.equal(calls.writes.length, 0);
  }
});

test('a concurrent status change returns conflict instead of a false success', async () => {
  const { calls, patch } = setup({ conflict: true });
  assert.equal((await patch()).status, 409);
  assert.equal(calls.history.length, 0);
});

test('database errors never return success or create status history', async () => {
  for (const options of [{ writeError: { message: 'permission denied' } }, { readError: { message: 'connection failed' } }]) {
    const { calls, patch } = setup(options);
    assert.equal((await patch()).status, 500);
    assert.equal(calls.history.length, 0);
  }
});

test('rejection requires a meaningful reason on the server', async () => {
  const { calls, patch } = setup();
  assert.equal((await patch({ toStatus: 'REJECTED_BY_PARTNER', reason: '  ' })).status, 400);
  assert.equal(calls.privilegedClients, 0);
  const response = await patch({ toStatus: 'REJECTED_BY_PARTNER', reason: ' Không thể cung ứng ' });
  assert.equal(response.status, 200);
  assert.equal(calls.history[0].reason, 'Không thể cung ứng');
});

test('history failure reports the saved status and an explicit warning', async () => {
  const { patch } = setup({ historyError: { message: 'history unavailable' } });
  const response = await patch();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ACCEPTED');
  assert.ok(body.warning);
});
