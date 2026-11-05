import 'server-only';
import { requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { mergeShippingAddress } from './shipping-address';

// Checkout stores the delivery snapshot on the parent order. Partners cannot
// read parent orders under RLS; authorize through their own child order here.
export async function withPartnerShipping<T extends { parent_order_id: string | null; shipping_address: unknown }>(orders: T[]) {
  if (!orders.length) return [];
  const user = await requireRole('PARTNER');
  const parentIds = [...new Set(orders.flatMap(order => order.parent_order_id ? [order.parent_order_id] : []))];
  const addresses = new Map<string, unknown>();
  for (let index = 0; index < parentIds.length; index += 100) {
    const admin = supabaseAdmin();
    const { data: children, error: childError } = await admin.from('orders')
      .select('parent_order_id')
      .eq('partner_id', user.id)
      .eq('order_level', 'CHILD')
      .in('parent_order_id', parentIds.slice(index, index + 100));
    if (childError) throw new Error(childError.message);
    const authorized = [...new Set(children.map(child => child.parent_order_id).filter(Boolean))];
    if (!authorized.length) continue;
    const { data, error } = await admin.from('orders')
      .select('id, shipping_address')
      .eq('order_level', 'PARENT')
      .in('id', authorized);
    if (error) throw new Error(error.message);
    for (const parent of data) addresses.set(parent.id, parent.shipping_address);
  }
  return orders.map(order => ({ ...order, shipping_address: mergeShippingAddress(order.shipping_address, addresses.get(order.parent_order_id ?? '')) }));
}
