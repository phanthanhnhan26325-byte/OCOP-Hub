import Link from 'next/link';
import { requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

const orderStatus: Record<string, string> = {
  CREATED: 'Mới tạo', PAYMENT_PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán',
  PENDING_ACCEPTANCE: 'Chờ doanh nghiệp tiếp nhận', ACCEPTED: 'Đã tiếp nhận', PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao', DELIVERED: 'Đã giao', COMPLETED: 'Hoàn thành',
  REJECTED_BY_PARTNER: 'Doanh nghiệp từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', PARTIALLY_REFUNDED: 'Hoàn một phần',
};

export default async function OrdersPage() {
  const user = await requireAuth();
  const supabase = await supabaseServer();
  const { data: parents } = await supabase
    .from('orders')
    .select('id, code, status, total, placed_at, payments(status, amount), orders_child:orders!parent_order_id(id, code, status, total, partner_id, partner_profiles(business_name), order_items(product_name, qty, unit_price))')
    .eq('customer_id', user.id)
    .eq('order_level', 'PARENT')
    .order('placed_at', { ascending: false });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Đơn hàng của tôi</h1>
      {!parents || parents.length === 0 ? (
        <p className="mt-6 text-slate-500">Chưa có đơn hàng. <Link href="/products" className="text-emerald-700 underline">Mua sắm ngay</Link></p>
      ) : (
        <div className="mt-6 space-y-4">
          {parents.map((o) => {
            const payment = Array.isArray(o.payments) ? o.payments[0] : o.payments;
            const children = o.orders_child ?? [];
            return (
              <div key={o.id} className="rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div>
                    <span className="font-semibold">{o.code}</span>
                    <span className="ml-3 text-sm text-slate-500">{formatDate(o.placed_at)}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-emerald-700">{formatVnd(o.total)}</span>
                    <span className={`ml-3 text-xs ${payment?.status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      Thanh toán: {payment?.status ?? 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3 text-sm">
                  <p className="mb-2 font-medium text-slate-600">Trạng thái đơn chung: {orderStatus[o.status] ?? o.status}</p>
                  <div className="space-y-2">
                    {children.map((c) => (
                      <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-2">
                        <div className="flex justify-between">
                          <span className="font-medium">{(c.partner_profiles as unknown as { business_name: string } | null)?.business_name ?? 'Doanh nghiệp'}</span>
                          <span className={c.status === 'REJECTED_BY_PARTNER' ? 'text-red-600' : 'text-emerald-700'}>
                            {orderStatus[c.status] ?? c.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {(c.order_items ?? []).map((i: { product_name: string; qty: number }) => `${i.product_name} ×${i.qty}`).join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
