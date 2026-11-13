import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/modules/orders/checkout.service.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const customerId = '00000000-0000-4000-8000-000000000001';
const itemIds = [
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
];

function setup() {
  const rpcCalls = [];
  const testModule = { exports: {} };
  const supabase = {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        async maybeSingle() {
          return { data: { id: '00000000-0000-4000-8000-000000000004', status: 'PENDING', amount: 150, provider: 'mock' }, error: null };
        },
        insert() {
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  const mocks = {
    zod: require('zod'),
    '@/lib/supabase/server': { supabaseServer: async () => supabase },
    '@/lib/errors': { AppError: class AppError extends Error {} },
    '@/lib/rbac': { requireAuth: async () => ({ id: customerId }) },
    '@/lib/env': { env: { PAYMENT_HOLD_TTL_MINUTES: 15, APP_URL: 'http://localhost:3000' } },
    '@/modules/auth/vietnamese-phone': {
      normalizeVietnamesePhone: (phone) => phone === '0900000000' || phone === '+84900000000' ? '+84900000000' : null,
    },
    './vietnam-address': {
      getVietnameseAddressNames: (provinceCode, communeCode) =>
        provinceCode === '01' && communeCode === '00004'
          ? { province: 'Hà Nội', commune: 'Phường Ba Đình' }
          : null,
    },
    '@/lib/supabase/admin': {
      supabaseAdmin: () => ({
        async rpc(name, args) {
          rpcCalls.push({ name, args });
          return { data: { order_id: 'order-id', code: 'OC12345678', total: 150, duplicated: false }, error: null };
        },
      }),
    },
    '@/modules/payments/providers': {
      getProvider: async () => ({
        name: 'mock',
        async create() {
          return { providerTxnId: 'txn-1', redirectUrl: 'http://localhost:3000/pay/mock/payment-id' };
        },
      }),
    },
  };

  vm.runInNewContext(compiled, {
    module: testModule,
    exports: testModule.exports,
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
      return mocks[name];
    },
  });
  return { service: testModule.exports, rpcCalls };
}

test('checkout input requires unique selected cart item IDs', () => {
  const { service } = setup();
  const base = {
    idempotencyKey: 'checkout-key-1',
    shippingAddress: {
      receiverName: 'Nguyen Van A', phone: '0900000000', address: '123 Duong ABC',
      provinceCode: '01', communeCode: '00004',
    },
  };
  assert.equal(service.checkoutInputSchema.safeParse({ ...base, selectedCartItemIds: itemIds }).success, true);
  assert.equal(service.checkoutInputSchema.safeParse({ ...base, selectedCartItemIds: [] }).success, false);
  assert.equal(service.checkoutInputSchema.safeParse({ ...base, selectedCartItemIds: [itemIds[0], itemIds[0]] }).success, false);
  assert.equal(service.checkoutInputSchema.safeParse({
    ...base,
    shippingAddress: { ...base.shippingAddress, communeCode: '' },
    selectedCartItemIds: itemIds,
  }).success, false);
});

test('checkout forwards only the selected cart item IDs to the atomic RPC', async () => {
  const { service, rpcCalls } = setup();
  await service.checkout({
    idempotencyKey: 'checkout-key-1',
    selectedCartItemIds: itemIds,
    shippingAddress: {
      receiverName: 'Nguyen Van A', phone: '0900000000', address: '123 Duong ABC',
      provinceCode: '01', communeCode: '00004',
    },
  });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'checkout');
  assert.deepEqual(Array.from(rpcCalls[0].args.p_selected_cart_item_ids), itemIds);
  assert.equal(rpcCalls[0].args.p_shipping_address.phone, '+84900000000');
  assert.equal(rpcCalls[0].args.p_shipping_address.city, 'Hà Nội');
  assert.equal(rpcCalls[0].args.p_shipping_address.ward, 'Phường Ba Đình');
});

test('checkout accepts a valid contact phone without SMS verification', async () => {
  const { service, rpcCalls } = setup();
  await service.checkout({
    idempotencyKey: 'checkout-key-1',
    selectedCartItemIds: itemIds,
    shippingAddress: {
      receiverName: 'Nguyen Van A', phone: '0900000000', address: '123 Duong ABC',
      provinceCode: '01', communeCode: '00004',
    },
  });
  assert.equal(rpcCalls.length, 1);
});

test('checkout rejects invalid Vietnamese phone formats', async () => {
  const { service, rpcCalls } = setup();
  await assert.rejects(
    () => service.checkout({
      idempotencyKey: 'checkout-key-1',
      selectedCartItemIds: itemIds,
      shippingAddress: {
        receiverName: 'Nguyen Van A', phone: '0123456789', address: '123 Duong ABC',
        provinceCode: '01', communeCode: '00004',
      },
    }),
    error => error.message === 'INVALID_PHONE',
  );
  assert.equal(rpcCalls.length, 0);
});
