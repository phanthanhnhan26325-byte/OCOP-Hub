import { loadFinanceEvents } from '@/lib/finance-events';
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
  event_id: string;
  id: string;
  code: string;
  parent_order_id: string;
  partner_id: string;
  status: string;
  subtotal: number | string;
  platform_fee: number | string;
  original_subtotal: number;
  recognized_at: string;
  partner_profiles: Relation<{ business_name: string }>;
  order_items: FinanceOrderItem[] | null;
  refunded_share: number;
  commission: number;
}

export interface FinanceWorkshopRegistration {
  event_id: string;
  id: string;
  code: string;
  amount: number | string;
  platform_fee: number | string;
  recognized_at: string;
  refund: number;
  starts_at: string;
  workshop_id: string;
  workshop_title: string;
  partner_id: string;
  partner_name: string;
}

export interface FinanceExpense {
  id: string;
  expense_type: 'OPERATING';
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
  workshopRegistrations: FinanceWorkshopRegistration[];
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
  return `${day}T00:00:00.000+07:00`;
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
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
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
  const [events, expensesResult, statementsResult, payoutsResult, recoveriesResult] = await Promise.all([
    loadFinanceEvents(start, end),
    supabase.from('financial_expenses').select('id, expense_type, description, amount, incurred_at, reference_code, recorded_by').eq('expense_type', 'OPERATING').gte('incurred_at', start).lt('incurred_at', end).order('incurred_at', { ascending: false }).limit(5000),
    supabase.from('settlement_statements').select('id, partner_id, period_start, period_end, gross_amount, refund_amount, platform_fee, adjustments, net_payable, status, created_at').gte('period_start', range.from).lte('period_end', range.to).order('created_at', { ascending: false }).limit(5000),
    supabase.from('payouts').select('id, statement_id, partner_id, amount, method, ref_no, transferred_at, recorded_by').gte('transferred_at', start).lt('transferred_at', end).order('transferred_at', { ascending: false }).limit(5000),
    supabase.from('partner_recoveries').select('id, partner_id, refund_id, order_id, amount, recovered_amount, created_at, partner_profiles(business_name)').order('created_at', { ascending: false }).limit(5000),
  ]);
  for (const result of [expensesResult, statementsResult, payoutsResult, recoveriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const orderEvents = events.filter(event => event.ref_type === 'SUB_ORDER' || event.ref_type === 'REFUND');
  const workshopEvents = events.filter(event => event.ref_type === 'WORKSHOP_REGISTRATION' || event.ref_type === 'WORKSHOP_REFUND');
  const orderIds = [...new Set(orderEvents.map(event => event.sale_id))];
  const registrationIds = [...new Set(workshopEvents.map(event => event.sale_id))];
  const orderDetails = new Map<string, Omit<FinanceOrder, 'recognized_at' | 'refunded_share' | 'commission' | 'original_subtotal' | 'event_id'>>();
  const workshopDetails = new Map<string, {
    code: string;
    workshop_sessions: Relation<{
      starts_at: string;
      workshops: Relation<{
        id: string; title: string; partner_id: string;
        partner_profiles: Relation<{ business_name: string }>;
      }>;
    }>;
  }>();

  await Promise.all([
    (async () => {
      for (let offset = 0; offset < orderIds.length; offset += 100) {
        const { data, error } = await supabase.from('orders')
          .select('id, code, parent_order_id, partner_id, status, subtotal, platform_fee, partner_profiles(business_name), order_items(product_id, product_name, qty, line_total, products(category_id, product_categories(name)))')
          .in('id', orderIds.slice(offset, offset + 100));
        if (error) throw new Error(error.message);
        for (const order of data) orderDetails.set(order.id, order as unknown as NonNullable<ReturnType<typeof orderDetails.get>>);
      }
    })(),
    (async () => {
      for (let offset = 0; offset < registrationIds.length; offset += 100) {
        const { data, error } = await supabase.from('workshop_registrations')
          .select('id, code, workshop_sessions(starts_at, workshops(id, title, partner_id, partner_profiles(business_name)))')
          .in('id', registrationIds.slice(offset, offset + 100));
        if (error) throw new Error(error.message);
        for (const registration of data) workshopDetails.set(registration.id, registration as unknown as NonNullable<ReturnType<typeof workshopDetails.get>>);
      }
    })(),
  ]);

  const orders = orderEvents.map((event): FinanceOrder => {
    const order = orderDetails.get(event.sale_id);
    if (!order) throw new Error('Missing order for finance event');
    return {
      ...order,
      event_id: event.ref_id + ':' + event.sale_id,
      subtotal: Number(event.gross),
      original_subtotal: Number(order.subtotal),
      recognized_at: event.recognized_at,
      refunded_share: Number(event.refund),
      commission: Number(event.fee),
    };
  });

  const workshopRegistrations = workshopEvents.map((event): FinanceWorkshopRegistration => {
    const registration = workshopDetails.get(event.sale_id);
    const session = firstFinanceRelation(registration?.workshop_sessions ?? null);
    const workshop = firstFinanceRelation(session?.workshops ?? null);
    if (!registration || !session || !workshop) throw new Error('Missing workshop for finance event');
    return {
      id: event.sale_id,
      event_id: event.ref_id,
      code: registration.code,
      amount: Number(event.gross),
      refund: Number(event.refund),
      platform_fee: Number(event.fee),
      recognized_at: event.recognized_at,
      starts_at: session.starts_at,
      workshop_id: workshop.id,
      workshop_title: workshop.title,
      partner_id: workshop.partner_id,
      partner_name: firstFinanceRelation(workshop.partner_profiles)?.business_name ?? 'Doanh nghiệp',
    };
  });

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

  return {
    orders,
    workshopRegistrations,
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
    if (!order.refunded_share) current.orderCount += 1;
    current.gmv += Number(order.subtotal);
    current.commission += order.commission;
    current.refunds += order.refunded_share;
    byPartner.set(order.partner_id, current);
  }
  return [...byPartner.values()].sort((a, b) => b.gmv - a.gmv);
}

export function financeGroupKey(dateValue: string, grouping: string) {
  const date = new Date(new Date(dateValue).getTime() + 7 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  if (grouping === 'year') return `${year}`;
  if (grouping === 'quarter') return `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
  if (grouping === 'month') return `${year}-${String(month).padStart(2, '0')}`;
  if (grouping === 'week') {
    date.setUTCHours(0, 0, 0, 0);
    const first = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((date.getTime() - first.getTime()) / 86_400_000 + first.getUTCDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  return date.toISOString().slice(0, 10);
}

export function financeBucketDates(range: FinanceRange, grouping: string) {
  const start = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && keys.length < 500) {
    const key = financeGroupKey(cursor.toISOString(), grouping);
    if (keys[keys.length - 1] !== key) keys.push(key);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (['month', 'quarter', 'year'].includes(grouping)) {
      cursor.setUTCDate(1);
      if (grouping === 'year') cursor.setUTCMonth(0);
      else if (grouping === 'quarter') cursor.setUTCMonth(Math.floor(cursor.getUTCMonth() / 3) * 3);
      cursor.setUTCMonth(cursor.getUTCMonth() + (grouping === 'month' ? 1 : grouping === 'quarter' ? 3 : 12));
    }
  }
  return keys;
}
