export type DashboardOrder = {
  id: string;
  parent_order_id: string;
  status: string;
  subtotal: number | string;
  platform_fee: number | string;
  placed_at: string;
};
export type DashboardPayment = {
  reference_id: string;
  status?: string;
  business_sync_status?: string;
  refunded_amount?: number | string;
  created_at?: string;
  payment_transactions: { type: string; status: string; created_at: string }[];
};
export type DashboardStatement = { net_payable: number | string; status: string; payouts: { amount: number | string }[] };
export type DashboardWorkshopSession = { id: string; workshop_id: string; starts_at: string; ends_at: string; status: string };

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

export function orderActivityCounts(
  orders: DashboardOrder[],
  payments: DashboardPayment[],
  month: string,
  period: 'all' | 'month',
) {
  const paidParents = new Set(payments.filter(payment =>
    ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status ?? '')
      || payment.payment_transactions.some(transaction => transaction.type === 'PAYMENT' && transaction.status === 'SUCCESS'),
  ).map(payment => payment.reference_id));
  const { start, end } = monthBounds(month);
  return orders.reduce((counts, order) => {
    if (!paidParents.has(order.parent_order_id)) return counts;
    if (period === 'month') {
      const placedAt = new Date(order.placed_at).getTime();
      if (placedAt < start.getTime() || placedAt >= end.getTime()) return counts;
    }
    if (['PAID', 'PENDING_ACCEPTANCE'].includes(order.status)) counts.unprocessed += 1;
    else if (!['CREATED', 'PAYMENT_PENDING', 'EXPIRED'].includes(order.status)) counts.processed += 1;
    return counts;
  }, { processed: 0, unprocessed: 0 });
}

export function workshopSessionCounts(
  sessions: DashboardWorkshopSession[],
  now: Date,
  month: string,
  period: 'all' | 'month',
) {
  const { start, end } = monthBounds(month);
  return sessions.reduce((counts, session) => {
    if (session.status === 'CANCELLED') return counts;
    const startsAt = new Date(session.starts_at).getTime();
    const endsAt = new Date(session.ends_at).getTime();
    if (period === 'month' && (startsAt < start.getTime() || startsAt >= end.getTime())) return counts;
    if (session.status !== 'COMPLETED' && startsAt > now.getTime()) counts.upcoming += 1;
    if (session.status === 'COMPLETED' || endsAt <= now.getTime()) counts.completed += 1;
    return counts;
  }, { upcoming: 0, completed: 0 });
}

export function paidOutInMonth(payouts: { amount: number | string; transferred_at: string }[], month: string) {
  const { start, end } = monthBounds(month);
  return payouts.reduce((total, payout) => {
    const transferredAt = new Date(payout.transferred_at).getTime();
    return transferredAt >= start.getTime() && transferredAt < end.getTime()
      ? total + Number(payout.amount)
      : total;
  }, 0);
}

export function outstandingPayable(statements: DashboardStatement[]) {
  return statements.filter(statement => statement.status === 'CONFIRMED').reduce((total, statement) =>
    total + Math.max(0, Number(statement.net_payable) - statement.payouts.reduce((sum, payout) => sum + Number(payout.amount), 0)), 0);
}
