import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseOrderPayment, filterPartnerOrders } from '../src/modules/orders/partner-order-view.ts';

const now = new Date('2026-11-01T15:00:00Z');
const payment = (status, created_at = '2026-11-01T10:00:00Z') => ({ status, created_at });
const orders = [
  { id: 'a', code: 'OC-001', parent_code: 'PARENT-01', placed_at: '2026-11-01T10:00:00Z', status: 'PENDING_ACCEPTANCE', shipping_address: { receiver_name: 'Đặng Thị Ánh', phone: '0900123456' }, payment: payment('PAID') },
  { id: 'b', code: 'OC-002', parent_code: 'PARENT-02', placed_at: '2026-08-01T10:00:00Z', status: 'SHIPPED', shipping_address: { receiver_name: 'Minh' }, payment: payment('PARTIALLY_REFUNDED') },
  { id: 'c', code: 'OC-003', parent_code: null, placed_at: '2026-10-31T10:00:00Z', status: 'PAYMENT_PENDING', shipping_address: {}, payment: null },
];
const defaults = { q: '', days: 'all', status: '', payment: '' };

test('keyword search matches Vietnamese names without accents, parent codes and phones', () => {
  for (const q of ['dang thi anh', 'ĐẶNG', 'parent-01', '0900123', 'oc-001']) {
    assert.deepEqual(filterPartnerOrders(orders, { ...defaults, q }, now).map(order => order.id), ['a']);
  }
});

test('date, processing and payment filters combine without inferring payment from order state', () => {
  assert.deepEqual(filterPartnerOrders(orders, { ...defaults, days: '30' }, now).map(order => order.id), ['a', 'c']);
  assert.deepEqual(filterPartnerOrders(orders, { ...defaults, days: '30', status: 'PENDING_ACCEPTANCE', payment: 'PAID' }, now).map(order => order.id), ['a']);
  assert.deepEqual(filterPartnerOrders(orders, { ...defaults, payment: 'UNKNOWN' }, now).map(order => order.id), ['c']);
  assert.deepEqual(filterPartnerOrders(orders, { ...defaults, status: 'SHIPPED', payment: 'PAID' }, now), []);
});

test('settled payments take priority over later failed retries; refund states remain visible', () => {
  const paid = payment('PAID', '2026-10-31T10:00:00Z');
  assert.equal(chooseOrderPayment([payment('FAILED'), payment('CREATED'), paid]), paid);
  const refund = payment('PARTIALLY_REFUNDED');
  assert.equal(chooseOrderPayment([payment('FAILED', '2026-11-02T10:00:00Z'), refund]), refund);
  assert.equal(chooseOrderPayment([]), null);
});
