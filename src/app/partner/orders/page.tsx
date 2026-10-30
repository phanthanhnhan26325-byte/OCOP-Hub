import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { SubOrderActions } from '@/components/partner/SubOrderActions';

export const dynamic = 'force-dynamic';

const st: Record<string, string> = {
  PENDING_ACCEPTANCE: 'Chờ tiếp nhận', ACCEPTED: 'Đã tiếp nhận', PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao', DELIVERED: 'Đã giao', COMPLETED: 'Hoàn thành', REJECTED_BY_PARTNER: 'Đã từ chối',
  PARTIALLY_REFUNDED: 'Hoàn một phần', EXPIRED: 'Hết hạn',
};

export default async function PartnerOrdersPage() {
  const user = await requireApprovedPartner();
  const supabase = await supabaseServer();
  const { data: orders } = await supabase
    .from('orders')
    .select('id, code, status, total, placed_at, shipping_address, order_items(product_name, qty, unit_price, line_total), customer:users!orders_customer_id_fkey(full_name, email, phone)')
    .eq('partner_id', user.id)
    .eq('order_level', 'CHILD')
    .order('placed_at', { ascending: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Phần đơn thuộc doanh nghiệp của bạn</h1>
      <p className="mt-1 text-sm text-slate-500">Bạn chỉ thấy và xử lý được phần đơn của mình — không ảnh hưởng doanh nghiệp khác.</p>
      <div className="mt-6 space-y-4">
        {(orders ?? []).map((o) => {
          const addr = o.shipping_address as { receiver_name?: string; phone?: string; address?: string } | null;
          const customer = o.customer as unknown as { full_name: string; email: string; phone: string } | null;
          return (
            <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{o.code}</span>
                  <span className="ml-3 text-sm text-slate-500">{formatDate(o.placed_at)}</span>
                </div>
                <span className={`text-sm font-medium ${o.status === 'REJECTED_BY_PARTNER' ? 'text-red-600' : 'text-emerald-700'}`}>
                  {st[o.status] ?? o.status}
                </span>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {(o.order_items ?? []).map((i, idx) => (
                  <li key={idx}>{i.product_name} × {i.qty} — {formatVnd(i.line_total)}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-slate-500">
                Nhận hàng: {addr?.receiver_name ?? customer?.full_name} · {addr?.phone ?? customer?.phone} · {addr?.address}
              </p>
              <p className="text-sm font-semibold">{formatVnd(o.total)}</p>
              <SubOrderActions orderId={o.id} status={o.status} />
            </div>
          );
        })}
        {(!orders || orders.length === 0) && <p className="text-slate-500">Chưa có phần đơn nào.</p>}
      </div>
    </div>
  );
}
