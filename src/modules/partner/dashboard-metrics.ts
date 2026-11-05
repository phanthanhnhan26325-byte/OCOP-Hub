export type DashboardOrder = { id: string; parent_order_id: string; status: string; total: number | string; placed_at: string };
export type DashboardPayment = { reference_id: string; status?: string; created_at?: string; payment_transactions: { type: string; status: string; created_at: string }[] };
export type DashboardStatement = { net_payable: number | string; status: string; payouts: { amount: number | string }[] };

export function vietnamMonth(now: Date) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}

export function monthBounds(month: string) {
  const [year, value] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, value - 1, 1) - 7 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, value, 1) - 7 * 60 * 60 * 1000);
  return { start, end };
}

// Sum this partner's completed child orders once, using the original payment date.
export function paidRevenue(orders: DashboardOrder[], payments: DashboardPayment[], month: string) {
  const { start, end } = monthBounds(month);
  const paidParents = new Set(payments.filter(payment => {
    const transactions = payment.payment_transactions.filter(transaction => transaction.type === 'PAYMENT' && transaction.status === 'SUCCESS');
    const paidAt = transactions.length
      ? Math.min(...transactions.map(transaction => new Date(transaction.created_at).getTime()))
      : payment.status === 'PAID' && payment.created_at ? new Date(payment.created_at).getTime() : NaN;
    return paidAt >= start.getTime() && paidAt < end.getTime();
  }).map(payment => payment.reference_id));
  return orders.reduce((total, order) => total + (order.status === 'COMPLETED' && paidParents.has(order.parent_order_id) ? Number(order.total) : 0), 0);
}

export function outstandingPayable(statements: DashboardStatement[]) {
  return statements.filter(statement => statement.status === 'CONFIRMED').reduce((total, statement) =>
    total + Math.max(0, Number(statement.net_payable) - statement.payouts.reduce((sum, payout) => sum + Number(payout.amount), 0)), 0);
}
