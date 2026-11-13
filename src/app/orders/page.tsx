import Link from 'next/link';
import { requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { CustomerOrderActions } from '@/components/customer/CustomerOrderActions';
import { withSignedOrderEvidence } from '@/modules/orders/order-service-requests';

export const dynamic = 'force-dynamic';

const orderStatus: Record<string, string> = {
  CREATED: 'Mới tạo', PAYMENT_PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán',
  PENDING_ACCEPTANCE: 'Chờ doanh nghiệp tiếp nhận', ACCEPTED: 'Đã tiếp nhận', PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao', DELIVERED: 'Đã giao', COMPLETED: 'Hoàn thành',
  RETURNED: 'Đã nhận lại hàng', REJECTED_BY_PARTNER: 'Doanh nghiệp từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', PARTIALLY_REFUNDED: 'Hoàn một phần',
};

export default async function OrdersPage() {
  const user = await requireAuth();
  const supabase = await supabaseServer();
  const { data: parents, error } = await supabase
    .from('orders')
    .select('id, code, status, total, placed_at, orders_child:orders!parent_order_id(id, code, status, total, partner_id, shipping_address, partner_profiles(business_name), order_items(id, product_id, product_name, qty, unit_price, products(slug)), order_service_requests(id, order_id, request_type, status, reason, evidence_path, contact_phone, partner_response, refund_amount, refund_status, created_at))')
    .eq('customer_id', user.id)
    .eq('order_level', 'PARENT')
    .order('placed_at', { ascending: false });
  if (error) throw new Error(error.message);
  const parentOrders = parents ?? [];
  const paymentsByParent = new Map<string, { status: string; amount: number | string }>();
  for (let index = 0; index < parentOrders.length; index += 100) {
    const batch = parentOrders.slice(index, index + 100);
    const { data: payments, error: paymentError } = await supabase
      .from('payments')
      .select('reference_id, status, amount, created_at')
      .eq('purpose', 'ORDER')
      .in('reference_id', batch.map(parent => parent.id))
      .order('created_at', { ascending: false });
    if (paymentError) throw new Error(paymentError.message);
    for (const payment of payments ?? []) {
      const current = paymentsByParent.get(payment.reference_id);
      const isSettled = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status);
      const currentIsSettled = current && ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(current.status);
      if (!current || (isSettled && !currentIsSettled)) {
        paymentsByParent.set(payment.reference_id, payment);
      }
    }
  }
  const orders = await Promise.all((parents ?? []).map(async parent => ({
    ...parent,
    payment: paymentsByParent.get(parent.id) ?? null,
    orders_child: await Promise.all((parent.orders_child ?? []).map(async child => ({
      ...child,
      order_service_requests: await withSignedOrderEvidence(child.order_service_requests ?? []),
    }))),
  })));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Đơn hàng của tôi</h1>
      {orders.length === 0 ? (
        <p className="mt-6 text-slate-500">Chưa có đơn hàng. <Link href="/products" className="text-emerald-700 underline">Mua sắm ngay</Link></p>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => {
            const payment = o.payment;
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
                      <div key={c.id} className="rounded-lg bg-slate-50 px-3 py-3">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">{(c.partner_profiles as unknown as { business_name: string } | null)?.business_name ?? 'Doanh nghiệp'}</span>
                          <span className={['REJECTED_BY_PARTNER', 'CANCELLED'].includes(c.status) ? 'text-red-600' : 'text-emerald-700'}>
                            {orderStatus[c.status] ?? c.status}
                          </span>
                        </div>
                        <div className="mt-1 space-y-1">
                          {(c.order_items ?? []).map((item) => {
                            const product = Array.isArray(item.products) ? item.products[0] : item.products;
                            return (
                              <div key={item.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                                <span className="text-slate-500">{item.product_name} ×{item.qty}</span>
                                {['DELIVERED', 'COMPLETED'].includes(c.status) && product?.slug && (
                                  <Link href={`/products/${product.slug}#reviews`} className="font-medium text-emerald-700 hover:underline">Đánh giá sản phẩm</Link>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <CustomerOrderActions
                          key={`${c.id}:${c.status}:${(c.order_service_requests ?? []).map((request: { id: string; status: string; refund_status: string }) => `${request.id}-${request.status}-${request.refund_status}`).join(',')}`}
                          orderId={c.id}
                          status={c.status}
                          phone={typeof c.shipping_address?.phone === 'string' ? c.shipping_address.phone : ''}
                          requests={c.order_service_requests ?? []}
                        />
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
