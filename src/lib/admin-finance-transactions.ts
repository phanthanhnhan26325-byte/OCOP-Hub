import {
  firstFinanceRelation,
  type FinanceExpense,
  type FinancePayout,
  type FinanceRange,
  type FinanceRecovery,
  type FinanceOrder,
} from '@/lib/admin-finance';
import { supabaseServer } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;

export interface FinanceTransaction {
  id: string;
  at: string;
  code: string;
  type: string;
  related: string;
  description: string;
  amount: number;
  direction: 'IN' | 'OUT' | 'RECOVERY';
  status: string;
  orderCode: string;
  partnerName: string;
  source: string;
}

function dayStart(day: string) {
  return `${day}T00:00:00.000Z`;
}

function nextDay(day: string) {
  const date = new Date(dayStart(day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export async function loadFinanceTransactions(
  supabase: Supabase,
  range: FinanceRange,
  orders: FinanceOrder[],
  expenses: FinanceExpense[],
  payouts: FinancePayout[],
  recoveries: FinanceRecovery[],
  limit = 1000,
): Promise<FinanceTransaction[]> {
  const [{ data: transactionData, error: transactionError }, { data: refundData, error: refundError }, { data: adjustmentData, error: adjustmentError }] =
    await Promise.all([
      supabase
        .from('payment_transactions')
        .select('id, payment_id, type, provider, provider_txn_id, amount, status, created_at')
        .gte('created_at', dayStart(range.from))
        .lt('created_at', nextDay(range.to))
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('refunds')
        .select('id, payment_id, ref_type, ref_id, amount, reason, status, provider_refund_id, created_at')
        .gte('created_at', dayStart(range.from))
        .lt('created_at', nextDay(range.to))
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('adjustments')
        .select('id, partner_id, amount, reason, created_at')
        .gte('created_at', dayStart(range.from))
        .lt('created_at', nextDay(range.to))
        .order('created_at', { ascending: false })
        .limit(limit),
    ]);
  if (transactionError) throw new Error(transactionError.message);
  if (refundError) throw new Error(refundError.message);
  if (adjustmentError) throw new Error(adjustmentError.message);

  const transactions = (transactionData ?? []) as unknown as {
    id: string;
    payment_id: string;
    type: string;
    provider: string;
    provider_txn_id: string;
    amount: number | string;
    status: string;
    created_at: string;
  }[];
  const refunds = (refundData ?? []) as unknown as {
    id: string;
    payment_id: string;
    ref_type: string;
    ref_id: string;
    amount: number | string;
    reason: string | null;
    status: string;
    provider_refund_id: string | null;
    created_at: string;
  }[];
  const adjustments = (adjustmentData ?? []) as unknown as {
    id: string;
    partner_id: string;
    amount: number | string;
    reason: string;
    created_at: string;
  }[];

  const paymentIds = [...new Set([
    ...transactions.map((transaction) => transaction.payment_id),
    ...refunds.map((refund) => refund.payment_id),
  ])];
  const { data: paymentData, error: paymentsError } = paymentIds.length > 0
    ? await supabase.from('payments').select('id, purpose, reference_id').in('id', paymentIds)
    : { data: [], error: null };
  if (paymentsError) throw new Error(paymentsError.message);
  const payments = (paymentData ?? []) as unknown as { id: string; purpose: string; reference_id: string }[];
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

  const orderIds = [...new Set([
    ...payments.filter((payment) => payment.purpose === 'ORDER').map((payment) => payment.reference_id),
    ...refunds.filter((refund) => refund.ref_type === 'ORDER').map((refund) => refund.ref_id),
  ])];
  const [{ data: orderData, error: ordersError }, { data: partnerData, error: partnersError }] = await Promise.all([
    orderIds.length > 0
      ? supabase.from('orders').select('id, code').in('id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    (() => {
      const partnerIds = [...new Set([
        ...adjustments.map((adjustment) => adjustment.partner_id),
        ...payouts.map((payout) => payout.partner_id),
        ...recoveries.map((recovery) => recovery.partner_id),
      ])];
      return partnerIds.length > 0
        ? supabase.from('partner_profiles').select('user_id, business_name').in('user_id', partnerIds)
        : Promise.resolve({ data: [], error: null });
    })(),
  ]);
  if (ordersError) throw new Error(ordersError.message);
  if (partnersError) throw new Error(partnersError.message);

  const orderCodes = new Map(((orderData ?? []) as unknown as { id: string; code: string }[]).map((order) => [order.id, order.code]));
  const partnerNames = new Map(((partnerData ?? []) as unknown as { user_id: string; business_name: string }[]).map((partner) => [partner.user_id, partner.business_name]));
  const rows: FinanceTransaction[] = [];

  for (const transaction of transactions.filter((entry) => entry.type === 'PAYMENT')) {
    const payment = paymentById.get(transaction.payment_id);
    const orderCode = payment?.purpose === 'ORDER' ? orderCodes.get(payment.reference_id) ?? '' : '';
    rows.push({
      id: `payment-${transaction.id}`,
      at: transaction.created_at,
      code: transaction.provider_txn_id,
      type: transaction.type === 'PAYMENT' ? 'Thanh toán đơn hàng' : 'Hoàn tiền khách hàng',
      related: payment?.purpose === 'ORDER' ? `Đơn ${orderCode || payment.reference_id.slice(0, 8)}` : 'Thanh toán workshop',
      description: transaction.provider,
      amount: Number(transaction.amount),
      direction: transaction.type === 'PAYMENT' ? 'IN' : 'OUT',
      status: transaction.status,
      orderCode,
      partnerName: '',
      source: `payment_transactions:${transaction.id}`,
    });
  }

  for (const refund of refunds) {
    const orderCode = refund.ref_type === 'ORDER' ? orderCodes.get(refund.ref_id) ?? '' : '';
    rows.push({
      id: `refund-${refund.id}`,
      at: refund.created_at,
      code: refund.provider_refund_id ?? refund.id,
      type: 'Hoàn tiền khách hàng',
      related: orderCode ? `Đơn ${orderCode}` : `${refund.ref_type} ${refund.ref_id.slice(0, 8)}`,
      description: refund.reason ?? 'Ghi nhận hoàn tiền',
      amount: Number(refund.amount),
      direction: 'OUT',
      status: refund.status,
      orderCode,
      partnerName: '',
      source: `refunds:${refund.id}`,
    });
  }

  for (const order of orders) {
    rows.push({
      id: `commission-${order.id}`,
      at: order.placed_at,
      code: `FEE-${order.code}`,
      type: 'Thu hoa hồng',
      related: order.code,
      description: 'Phí nền tảng đã chụp tại thời điểm đặt hàng',
      amount: order.commission,
      direction: 'IN',
      status: 'Đã ghi nhận',
      orderCode: order.code,
      partnerName: firstFinanceRelation(order.partner_profiles)?.business_name ?? '',
      source: `orders:${order.id}`,
    });
  }

  for (const payout of payouts) {
    rows.push({
      id: `payout-${payout.id}`,
      at: payout.transferred_at,
      code: payout.ref_no,
      type: 'Chi trả doanh nghiệp',
      related: partnerNames.get(payout.partner_id) ?? 'Doanh nghiệp',
      description: payout.method,
      amount: Number(payout.amount),
      direction: 'OUT',
      status: 'Đã ghi nhận',
      orderCode: '',
      partnerName: partnerNames.get(payout.partner_id) ?? '',
      source: `payouts:${payout.id}`,
    });
  }

  for (const expense of expenses) {
    rows.push({
      id: `expense-${expense.id}`,
      at: expense.incurred_at,
      code: expense.reference_code ?? expense.id,
      type: expense.expense_type === 'SHIPPING' ? 'Thanh toán vận chuyển' : 'Chi phí vận hành',
      related: expense.description,
      description: expense.reference_code ? `Tham chiếu ${expense.reference_code}` : 'Chi phí được Admin ghi nhận',
      amount: Number(expense.amount),
      direction: 'OUT',
      status: 'Đã ghi nhận',
      orderCode: '',
      partnerName: '',
      source: `financial_expenses:${expense.id}`,
    });
  }

  for (const recovery of recoveries.filter((entry) =>
    entry.created_at >= dayStart(range.from) && entry.created_at < nextDay(range.to),
  )) {
    const outstanding = Number(recovery.amount) - Number(recovery.recovered_amount);
    if (outstanding <= 0) continue;
    rows.push({
      id: `recovery-${recovery.id}`,
      at: recovery.created_at,
      code: `REC-${recovery.id}`,
      type: 'Thu hồi khoản đã chi trả',
      related: partnerNames.get(recovery.partner_id) ?? 'Doanh nghiệp',
      description: `Hoàn tiền ${recovery.refund_id.slice(0, 8)} · Đã thu hồi ${Number(recovery.recovered_amount).toLocaleString('vi-VN')} đ`,
      amount: outstanding,
      direction: 'RECOVERY',
      status: 'Chờ khấu trừ kỳ đối soát',
      orderCode: '',
      partnerName: partnerNames.get(recovery.partner_id) ?? '',
      source: `partner_recoveries:${recovery.id}`,
    });
  }

  for (const adjustment of adjustments) {
    const amount = Number(adjustment.amount);
    rows.push({
      id: `adjustment-${adjustment.id}`,
      at: adjustment.created_at,
      code: `ADJ-${adjustment.id}`,
      type: 'Điều chỉnh tài chính',
      related: partnerNames.get(adjustment.partner_id) ?? 'Doanh nghiệp',
      description: adjustment.reason,
      amount: Math.abs(amount),
      direction: amount < 0 ? 'OUT' : 'IN',
      status: 'Đã ghi nhận',
      orderCode: '',
      partnerName: partnerNames.get(adjustment.partner_id) ?? '',
      source: `adjustments:${adjustment.id}`,
    });
  }

  return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}
