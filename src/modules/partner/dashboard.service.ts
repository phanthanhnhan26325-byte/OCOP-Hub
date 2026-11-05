import 'server-only';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { RecentOrder } from '@/components/partner/RecentOrders';
import { withPartnerShipping } from '@/modules/orders/partner-shipping.service';
import { outstandingPayable, paidRevenue, vietnamMonth, type DashboardOrder, type DashboardPayment, type DashboardStatement } from './dashboard-metrics';

type Session = { id: string; starts_at: string; ends_at: string; location: string; capacity: number; workshop_id: string; workshop_registrations: { status: string }[] };
type Workshop = { id: string; title: string; status: string; reject_reason: string | null };

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await page(from, from + 499);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export async function getPartnerDashboard(requestedMonth?: string) {
  const user = await requireRole('PARTNER');
  const db = await supabaseServer();
  const now = new Date();
  const month = requestedMonth && /^(20\d{2}|[3-9]\d{3})-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : vietnamMonth(now);
  const [profileResult, applicationResult, recentOrdersResult, orders, statements, workshops] = await Promise.all([
    db.from('partner_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('partner_applications').select('id, status, reject_reason, created_at').eq('partner_id', user.id).order('created_at', { ascending: false }).limit(5),
    db.from('orders').select('id, parent_order_id, code, status, total, placed_at, shipping_address, order_items(product_name, qty)').eq('partner_id', user.id).eq('order_level', 'CHILD').order('placed_at', { ascending: false }).order('id', { ascending: false }).limit(5),
    allRows<DashboardOrder>((from, to) => db.from('orders').select('id, parent_order_id, status, total, placed_at').eq('partner_id', user.id).eq('order_level', 'CHILD').order('id').range(from, to)),
    allRows<DashboardStatement>((from, to) => db.from('settlement_statements').select('net_payable, status, payouts(amount)').eq('partner_id', user.id).eq('status', 'CONFIRMED').order('id').range(from, to)),
    allRows<Workshop>((from, to) => db.from('workshops').select('id, title, status, reject_reason').eq('partner_id', user.id).order('id').range(from, to)),
  ]);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (applicationResult.error) throw new Error(applicationResult.error.message);
  if (recentOrdersResult.error) throw new Error(recentOrdersResult.error.message);
  const recentOrders = await withPartnerShipping(recentOrdersResult.data as RecentOrder[]);
  const payments: DashboardPayment[] = [];
  const parents = [...new Set(orders.map(order => order.parent_order_id))];
  // Payments are customer-only under RLS. Read only payments linked to child
  // orders already scoped to the authenticated partner; expose aggregates only.
  for (let i = 0; i < parents.length; i += 100) {
    const batch = parents.slice(i, i + 100);
    payments.push(...await allRows<DashboardPayment>((from, to) => supabaseAdmin().from('payments').select('reference_id, status, created_at, payment_transactions(type, status, created_at)').eq('purpose', 'ORDER').in('reference_id', batch).order('id').range(from, to)));
  }
  const approvedWorkshops = workshops.filter(workshop => workshop.status === 'APPROVED');
  const sessions: Session[] = [];
  const horizon = new Date(now.getTime() + 30 * 86400000);
  for (let i = 0; i < approvedWorkshops.length; i += 100) {
    const ids = approvedWorkshops.slice(i, i + 100).map(workshop => workshop.id);
    sessions.push(...await allRows<Session>((from, to) => db.from('workshop_sessions').select('id, workshop_id, starts_at, ends_at, location, capacity, workshop_registrations(status)').in('workshop_id', ids).in('status', ['SCHEDULED', 'OPEN']).gt('starts_at', now.toISOString()).lte('starts_at', horizon.toISOString()).order('starts_at').order('id').range(from, to)));
  }
  sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const upcoming = sessions.map(session => ({ ...session, title: approvedWorkshops.find(workshop => workshop.id === session.workshop_id)!.title, registered: session.workshop_registrations.filter(registration => registration.status === 'CONFIRMED').length }));
  const rejectedProducts = await db.from('products').select('id, name, reject_reason').eq('partner_id', user.id).eq('status', 'REJECTED').order('updated_at', { ascending: false }).limit(3);
  if (rejectedProducts.error) throw new Error(rejectedProducts.error.message);
  const pending = orders.filter(order => order.status === 'PENDING_ACCEPTANCE');
  return { profile: profileResult.data, applications: applicationResult.data, recentOrders, month, now, pending, revenue: paidRevenue(orders, payments, month), payable: outstandingPayable(statements), statementCount: statements.length, upcoming, rejectedWorkshops: workshops.filter(workshop => workshop.status === 'REJECTED'), rejectedProducts: rejectedProducts.data };
}
