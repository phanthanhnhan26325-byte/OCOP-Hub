import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, code, status, total, placed_at, shipping_address, users!orders_customer_id_fkey(full_name, email), orders_child:orders!parent_order_id(id, code, status, total, subtotal, shipping_fee, platform_fee, partner_profiles(business_name), order_items(product_name, product_image, unit_price, qty, line_total), order_status_history(from_status, to_status, actor_role, reason, created_at))')
    .eq('order_level', 'PARENT')
    .order('placed_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

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
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-emerald-800">Chi tiết giao hàng, sản phẩm và lịch sử ({o.orders_child?.length ?? 0} doanh nghiệp)</summary>
                <div className="mt-3 space-y-3">
                  <pre className="overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(o.shipping_address, null, 2)}</pre>
                  {(o.orders_child ?? []).map((child) => {
                    const partner = child.partner_profiles as unknown as { business_name: string } | null;
                    return (
                      <section key={child.id} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <span className="font-medium">{partner?.business_name ?? 'Doanh nghiệp'} · {child.code}</span>
                          <span>{child.status} · {formatVnd(child.total)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Hàng {formatVnd(child.subtotal)} · Vận chuyển {formatVnd(child.shipping_fee)} · Phí nền tảng {formatVnd(child.platform_fee)}</p>
                        <ul className="mt-2 divide-y divide-slate-100">
                          {(child.order_items ?? []).map((item, index) => (
                            <li key={`${child.id}-${index}`} className="flex justify-between gap-3 py-2 text-xs">
                              <span>{item.product_name} × {item.qty}</span><span>{formatVnd(item.line_total)}</span>
                            </li>
                          ))}
                        </ul>
                        {child.order_status_history?.length > 0 && (
                          <ol className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                            {child.order_status_history.map((history, index) => (
                              <li key={`${child.id}-history-${index}`}>{history.from_status ?? '—'} → {history.to_status} · {history.actor_role ?? 'SYSTEM'} · {formatDate(history.created_at)}{history.reason ? ` · ${history.reason}` : ''}</li>
                            ))}
                          </ol>
                        )}
                      </section>
                    );
                  })}
                </div>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}
