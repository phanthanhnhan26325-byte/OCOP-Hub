import 'server-only';
import { z } from 'zod';
import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withPartnerShipping } from './partner-shipping.service';
import { chooseOrderPayment, type OrderPayment, type PartnerOrder, type PartnerOrderRecord } from './partner-order-view';

const columns = 'id, parent_order_id, customer_id, code, status, total, subtotal, shipping_fee, discount, platform_fee, placed_at, updated_at, shipping_address, order_items(id, product_name, product_image, qty, unit_price, line_total)';

// Only accepts rows loaded by the partner-scoped queries below. Never export
// this helper or accept a parent/payment reference from client input.
async function enrichOwnedOrders(orders: PartnerOrderRecord[]): Promise<PartnerOrder[]> {
  const enriched = await withPartnerShipping(orders);
  const ids = [...new Set(orders.flatMap(order => order.parent_order_id ? [order.parent_order_id] : []))];
  const parentCodes = new Map<string, string>();
  const payments: OrderPayment[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const admin = supabaseAdmin();
    const [parents, paymentResult] = await Promise.all([
      admin.from('orders').select('id, code').eq('order_level', 'PARENT').in('id', batch),
      admin.from('payments').select('reference_id, status, provider, created_at, payment_transactions(type, status, created_at)').eq('purpose', 'ORDER').in('reference_id', batch).order('created_at', { ascending: false }),
    ]);
    if (parents.error) throw new Error(parents.error.message);
    if (paymentResult.error) throw new Error(paymentResult.error.message);
    for (const parent of parents.data) parentCodes.set(parent.id, parent.code);
    payments.push(...paymentResult.data);
  }
  return enriched.map(order => ({ ...order, parent_code: parentCodes.get(order.parent_order_id ?? '') ?? null, payment: chooseOrderPayment(payments.filter(payment => payment.reference_id === order.parent_order_id)) }));
}

export async function getPartnerOrders() {
  const user = await requireApprovedPartner();
  const db = await supabaseServer();
  const orders: PartnerOrderRecord[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('orders').select(columns).eq('partner_id', user.id).eq('order_level', 'CHILD').order('placed_at', { ascending: false }).order('id').range(from, from + 499);
    if (error) throw new Error(error.message);
    orders.push(...data as PartnerOrderRecord[]);
    if (data.length < 500) break;
  }
  return enrichOwnedOrders(orders);
}

export async function getPartnerOrderDetail(id: string) {
  const user = await requireApprovedPartner();
  if (!z.string().uuid().safeParse(id).success) return null;
  const db = await supabaseServer();
  const { data, error } = await db.from('orders').select(columns).eq('id', id).eq('partner_id', user.id).eq('order_level', 'CHILD').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [order] = await enrichOwnedOrders([data as PartnerOrderRecord]);
  // Only the buyer of this already-authorized child order is looked up.
  const [history, customer] = await Promise.all([
    db.from('order_status_history').select('id, from_status, to_status, actor_role, reason, created_at').eq('order_id', id).order('created_at', { ascending: false }).order('id'),
    supabaseAdmin().from('users').select('email').eq('id', order.customer_id).maybeSingle(),
  ]);
  if (history.error) throw new Error(history.error.message);
  if (customer.error) throw new Error(customer.error.message);
  return { order, history: history.data, customerEmail: customer.data?.email ?? null };
}
