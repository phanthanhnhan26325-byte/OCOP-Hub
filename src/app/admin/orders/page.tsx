import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: orders } = await supabase
    .from('orders')
    .select('id, code, status, total, placed_at, users!orders_customer_id_fkey(full_name, email), orders_child:orders!parent_order_id(id, code, status, total, partner_profiles(business_name))')
    .eq('order_level', 'PARENT')
    .order('placed_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <h1 className="text-2xl font-bold">Giám sát đơn hàng</h1>
      <div className="mt-6 space-y-4">
        {(orders ?? []).map((o) => {
          const customer = o.users as unknown as { full_name: string; email: string } | null;
          return (
            <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold">{o.code}</span>
                <span className="font-semibold text-emerald-700">{formatVnd(o.total)}</span>
              </div>
              <p className="text-slate-500">{customer?.full_name} ({customer?.email}) · {formatDate(o.placed_at)} · {o.status}</p>
              <ul className="mt-2 space-y-1 text-xs text-slate-600">
                {(o.orders_child ?? []).map((c) => (
                  <li key={c.id}>
                    {(c.partner_profiles as unknown as { business_name: string } | null)?.business_name}: {c.code} — {c.status} — {formatVnd(c.total)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
