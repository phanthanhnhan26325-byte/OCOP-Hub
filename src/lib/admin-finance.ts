import { supabaseServer } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof supabaseServer>>;
type Relation<T> = T | T[] | null;

export interface FinanceRange {
  from: string;
  to: string;
}

export interface FinanceOrderItem {
  product_id: string;
  product_name: string;
  qty: number;
  line_total: number | string;
  products: Relation<{
    category_id: string | null;
    product_categories: Relation<{ name: string }>;
  }>;
}

export interface FinanceOrder {
  id: string;
  code: string;
  parent_order_id: string;
  partner_id: string;
  status: string;
  subtotal: number | string;
  platform_fee: number | string;
  shipping_fee: number | string;
  placed_at: string;
  partner_profiles: Relation<{ business_name: string }>;
  order_items: FinanceOrderItem[] | null;
  refunded_share: number;
  commission: number;
}

export interface FinanceExpense {
  id: string;
  expense_type: 'SHIPPING' | 'OPERATING';
  description: string;
  amount: number | string;
  incurred_at: string;
  reference_code: string | null;
  recorded_by: string;
}

export interface FinanceStatement {
  id: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  gross_amount: number | string;
  refund_amount: number | string;
  platform_fee: number | string;
  adjustments: number | string;
  net_payable: number | string;
  status: string;
  created_at: string;
}

export interface FinancePayout {
  id: string;
  statement_id: string;
  partner_id: string;
  amount: number | string;
  method: string;
  ref_no: string;
  transferred_at: string;
  recorded_by: string | null;
}

export interface FinanceRecovery {
  id: string;
  partner_id: string;
  refund_id: string;
  order_id: string;
  amount: number | string;
  recovered_amount: number | string;
  created_at: string;
  partner_profiles: Relation<{ business_name: string }>;
}

export interface FinanceSnapshot {
  orders: FinanceOrder[];
  expenses: FinanceExpense[];
  statements: FinanceStatement[];
  payouts: FinancePayout[];
  recoveries: FinanceRecovery[];
  paidByStatement: Record<string, number>;
}

export function firstFinanceRelation<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function isoDayStart(day: string) {
  return `${day}T00:00:00.000Z`;
}

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function financeDateRange(
  range: string,
  fromValue?: string,
  toValue?: string,
): FinanceRange & { range: string } {
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const lastOfPreviousMonth = addDays(firstOfMonth, -1);
  const firstOfPreviousMonth = `${lastOfPreviousMonth.slice(0, 7)}-01`;
  const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const firstOfQuarter = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`;

  if (range === 'custom') {
    const validFrom = /^\d{4}-\d{2}-\d{2}$/.test(fromValue ?? '') ? fromValue! : today;
    const validTo = /^\d{4}-\d{2}-\d{2}$/.test(toValue ?? '') ? toValue! : today;
    if (validFrom <= validTo) return { range, from: validFrom, to: validTo };
  }
  switch (range) {
    case 'today':
      return { range, from: today, to: today };
    case '7d':
      return { range, from: addDays(today, -6), to: today };
    case '30d':
      return { range, from: addDays(today, -29), to: today };
    case 'month':
      return { range, from: firstOfMonth, to: today };
    case 'last_month':
      return { range, from: firstOfPreviousMonth, to: lastOfPreviousMonth };
    case 'quarter':
      return { range, from: firstOfQuarter, to: today };
    case 'year':
      return { range, from: `${year}-01-01`, to: today };
    default:
      return { range: '30d', from: addDays(today, -29), to: today };
  }
}

export function previousFinanceRange(range: FinanceRange): FinanceRange {
  const days = Math.round(
    (new Date(`${range.to}T00:00:00.000Z`).getTime() -
      new Date(`${range.from}T00:00:00.000Z`).getTime()) / 86_400_000,
  ) + 1;
  const previousTo = addDays(range.from, -1);
  return { from: addDays(previousTo, -(days - 1)), to: previousTo };
}

export async function loadFinanceSnapshot(
  supabase: Supabase,
  range: FinanceRange,
): Promise<FinanceSnapshot> {
  const start = isoDayStart(range.from);
  const end = isoDayStart(addDays(range.to, 1));
  const { data: orderData, error: orderError } = await supabase
    .from('orders')
    .select('id, code, parent_order_id, partner_id, status, subtotal, platform_fee, shipping_fee, placed_at, partner_profiles(business_name), order_items(product_id, product_name, qty, line_total, products(category_id, product_categories(name)))')
    .eq('order_level', 'CHILD')
    .in('status', ['DELIVERED', 'COMPLETED'])
    .gte('placed_at', start)
    .lt('placed_at', end)
    .order('placed_at', { ascending: false })
    .limit(5000);
  if (orderError) throw new Error(orderError.message);

  const candidateOrders = (orderData ?? []) as unknown as Omit<FinanceOrder, 'refunded_share' | 'commission'>[];
  const parentIds = [...new Set(candidateOrders.map((order) => order.parent_order_id))];
  const [allChildrenResult, paymentsResult, expensesResult, statementsResult, payoutsResult, recoveriesResult] =
    await Promise.all([
      parentIds.length > 0
        ? supabase.from('orders').select('parent_order_id, subtotal').eq('order_level', 'CHILD').in('parent_order_id', parentIds).limit(10000)
        : Promise.resolve({ data: [], error: null }),
      parentIds.length > 0
        ? supabase.from('payments').select('id, reference_id, status, refunded_amount, business_sync_status').eq('purpose', 'ORDER').in('reference_id', parentIds).in('status', ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']).eq('business_sync_status', 'SYNCED')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('financial_expenses').select('id, expense_type, description, amount, incurred_at, reference_code, recorded_by').gte('incurred_at', start).lt('incurred_at', end).order('incurred_at', { ascending: false }).limit(5000),
      supabase.from('settlement_statements').select('id, partner_id, period_start, period_end, gross_amount, refund_amount, platform_fee, adjustments, net_payable, status, created_at').gte('period_start', range.from).lte('period_end', range.to).order('created_at', { ascending: false }).limit(5000),
      supabase.from('payouts').select('id, statement_id, partner_id, amount, method, ref_no, transferred_at, recorded_by').gte('transferred_at', start).lt('transferred_at', end).order('transferred_at', { ascending: false }).limit(5000),
      supabase.from('partner_recoveries').select('id, partner_id, refund_id, order_id, amount, recovered_amount, created_at, partner_profiles(business_name)').order('created_at', { ascending: false }).limit(5000),
    ]);

  for (const result of [allChildrenResult, paymentsResult, expensesResult, statementsResult, payoutsResult, recoveriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const statements = (statementsResult.data ?? []) as unknown as FinanceStatement[];
  const statementIds = statements.map((statement) => statement.id);
  const { data: statementPayoutData, error: statementPayoutError } = statementIds.length > 0
    ? await supabase.from('payouts').select('statement_id, amount').in('statement_id', statementIds).limit(10000)
    : { data: [], error: null };
  if (statementPayoutError) throw new Error(statementPayoutError.message);
  const paidByStatement: Record<string, number> = {};
  for (const payout of (statementPayoutData ?? []) as unknown as { statement_id: string; amount: number | string }[]) {
    paidByStatement[payout.statement_id] = (paidByStatement[payout.statement_id] ?? 0) + Number(payout.amount);
  }

  const allChildren = (allChildrenResult.data ?? []) as unknown as { parent_order_id: string; subtotal: number | string }[];
  const payments = (paymentsResult.data ?? []) as unknown as {
    id: string;
    reference_id: string;
    refunded_amount: number | string;
  }[];
  const refundableByParent = new Map<string, number>();
  for (const payment of payments) {
    refundableByParent.set(
      payment.reference_id,
      (refundableByParent.get(payment.reference_id) ?? 0) + Number(payment.refunded_amount),
    );
  }
  const totalByParent = new Map<string, number>();
  for (const child of allChildren) {
    totalByParent.set(child.parent_order_id, (totalByParent.get(child.parent_order_id) ?? 0) + Number(child.subtotal));
  }
  const paidParents = new Set(payments.map((payment) => payment.reference_id));
  const orders = candidateOrders
    .filter((order) => paidParents.has(order.parent_order_id))
    .map((order): FinanceOrder => {
      const parentTotal = totalByParent.get(order.parent_order_id) ?? 0;
      const parentRefund = refundableByParent.get(order.parent_order_id) ?? 0;
      const refundShare = parentTotal > 0 ? Math.min(Number(order.subtotal), parentRefund * Number(order.subtotal) / parentTotal) : 0;
      const fee = Number(order.platform_fee);
      const commission = Number(order.subtotal) > 0
        ? Math.max(0, fee * (1 - refundShare / Number(order.subtotal)))
        : 0;
      return { ...order, refunded_share: refundShare, commission };
    });

  return {
    orders,
    expenses: (expensesResult.data ?? []) as unknown as FinanceExpense[],
    statements,
    payouts: (payoutsResult.data ?? []) as unknown as FinancePayout[],
    recoveries: (recoveriesResult.data ?? []) as unknown as FinanceRecovery[],
    paidByStatement,
  };
}

export function financeTrend(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function groupFinanceOrders(orders: FinanceOrder[]) {
  const byPartner = new Map<string, {
    partnerId: string;
    name: string;
    orderCount: number;
    gmv: number;
    commission: number;
    refunds: number;
  }>();
  for (const order of orders) {
    const partner = firstFinanceRelation(order.partner_profiles);
    const current = byPartner.get(order.partner_id) ?? {
      partnerId: order.partner_id,
      name: partner?.business_name ?? 'Doanh nghiệp',
      orderCount: 0,
      gmv: 0,
      commission: 0,
      refunds: 0,
    };
    current.orderCount += 1;
    current.gmv += Number(order.subtotal);
    current.commission += order.commission;
    current.refunds += order.refunded_share;
    byPartner.set(order.partner_id, current);
  }
  return [...byPartner.values()].sort((a, b) => b.gmv - a.gmv);
}

export function financeGroupKey(dateValue: string, grouping: string) {
  const date = new Date(dateValue);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (grouping === 'year') return `${year}`;
  if (grouping === 'quarter') return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  if (grouping === 'month') return `${year}-${String(month).padStart(2, '0')}`;
  if (grouping === 'week') {
    const first = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((date.getTime() - first.getTime()) / 86_400_000 + first.getUTCDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  return dateValue.slice(0, 10);
}

export function financeBucketDates(range: FinanceRange, grouping: string) {
  const start = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && keys.length < 500) {
    const key = financeGroupKey(cursor.toISOString(), grouping);
    if (keys[keys.length - 1] !== key) keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + (grouping === 'week' ? 7 : 1));
    if (['month', 'quarter', 'year'].includes(grouping)) {
      cursor.setUTCDate(1);
      if (grouping === 'year') cursor.setUTCMonth(0);
      else if (grouping === 'quarter') cursor.setUTCMonth(Math.floor(cursor.getUTCMonth() / 3) * 3);
      cursor.setUTCMonth(cursor.getUTCMonth() + (grouping === 'month' ? 1 : grouping === 'quarter' ? 3 : 12));
    }
  }
  return keys;
}
