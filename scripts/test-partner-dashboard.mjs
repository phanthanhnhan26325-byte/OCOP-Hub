import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthBounds, outstandingPayable, paidRevenue, vietnamMonth } from '../src/modules/partner/dashboard-metrics.ts';

test('month boundaries and default month follow Vietnam time, including year rollover', () => {
  assert.equal(vietnamMonth(new Date('2026-10-31T17:00:00Z')), '2026-11');
  assert.equal(monthBounds('2026-12').start.toISOString(), '2026-11-30T17:00:00.000Z');
  assert.equal(monthBounds('2026-12').end.toISOString(), '2026-12-31T17:00:00.000Z');
});

test('revenue counts only completed and paid partner portions in the payment month', () => {
  const orders = [
    { id: 'a', parent_order_id: 'p1', total: '200000', status: 'COMPLETED', placed_at: '2026-10-01' },
    { id: 'b', parent_order_id: 'p2', total: 300000, status: 'PENDING_ACCEPTANCE', placed_at: '2026-10-31' },
    { id: 'c', parent_order_id: 'p3', total: 400000, status: 'CREATED', placed_at: '2026-11-01' },
    { id: 'd', parent_order_id: 'p4', total: 500000, status: 'COMPLETED', placed_at: '2026-11-30' },
  ];
  const tx = (created_at, status = 'SUCCESS', type = 'PAYMENT') => ({ created_at, status, type });
  const payments = [
    { reference_id: 'p1', payment_transactions: [tx('2026-10-31T17:00:00Z'), tx('2026-11-05T00:00:00Z', 'SUCCESS', 'REFUND')] },
    { reference_id: 'p1', payment_transactions: [tx('2026-11-01T00:00:00Z')] },
    { reference_id: 'p2', payment_transactions: [tx('2026-10-31T16:59:59Z')] },
    { reference_id: 'p3', payment_transactions: [tx('2026-11-15T00:00:00Z', 'FAILED')] },
    { reference_id: 'p4', payment_transactions: [tx('2026-11-30T17:00:00Z')] },
    { reference_id: 'other-partner', payment_transactions: [tx('2026-11-01T00:00:00Z')] },
  ];
  assert.equal(paidRevenue(orders, payments, '2026-11'), 200000);
});

test('outstanding excludes drafts and paid periods and subtracts partial transfers', () => {
  assert.equal(outstandingPayable([
    { net_payable: '800000', status: 'CONFIRMED', payouts: [{ amount: '200000' }, { amount: 100000 }] },
    { net_payable: 900000, status: 'DRAFT', payouts: [] },
    { net_payable: 700000, status: 'PAID', payouts: [{ amount: 700000 }] },
    { net_payable: 100, status: 'CONFIRMED', payouts: [{ amount: 200 }] },
  ]), 500000);
  assert.equal(outstandingPayable([]), 0);
  assert.equal(paidRevenue([], [], '2026-11'), 0);
});

test('completed paid orders without transaction history count, unpaid and unfinished orders do not', () => {
  const orders = [
    { id: 'a', parent_order_id: 'p1', total: '160000', status: 'COMPLETED', placed_at: '2026-11-01' },
    { id: 'b', parent_order_id: 'p2', total: 300000, status: 'SHIPPED', placed_at: '2026-11-01' },
    { id: 'c', parent_order_id: 'p3', total: 400000, status: 'COMPLETED', placed_at: '2026-11-01' },
  ];
  const payment = (reference_id, status = 'PAID') => ({ reference_id, status, created_at: '2026-11-03T00:00:00Z', payment_transactions: [] });
  assert.equal(paidRevenue(orders, [payment('p1'), payment('p1'), payment('p2'), payment('p3', 'PENDING')], '2026-11'), 160000);
  assert.equal(paidRevenue(orders, [payment('p1')], '2026-10'), 0);
});
