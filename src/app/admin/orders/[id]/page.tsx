import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderAdminActions } from '@/components/admin/OrderAdminActions';
import { OrderShipmentForm } from '@/components/admin/OrderShipmentForm';
import { formatDate, formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface OrderHistory {
  id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string | null;
  actor_role: string | null;
  reason: string | null;
  created_at: string;
}

interface OrderItem {
  product_name: string;
  product_image: string | null;
  partner_id: string;
  unit_price: number | string;
  qty: number;
  line_total: number | string;
}

interface ChildOrder {
  id: string;
  code: string;
  status: string;
  subtotal: number | string;
  discount: number | string;
  shipping_fee: number | string;
  total: number | string;
  partner_id: string;
  partner_profiles: { business_name: string } | { business_name: string }[] | null;
  order_items: OrderItem[] | null;
  order_status_history: OrderHistory[] | null;
  order_shipments: {
    carrier_name: string;
    tracking_number: string;
    handed_over_at: string | null;
    delivered_at: string | null;
  } | {
    carrier_name: string;
    tracking_number: string;
    handed_over_at: string | null;
    delivered_at: string | null;
  }[] | null;
}

interface ParentOrder {
  id: string;
  code: string;
  status: string;
  subtotal: number | string;
  discount: number | string;
  shipping_fee: number | string;
  total: number | string;
  placed_at: string;
  shipping_address: Record<string, unknown> | null;
  users: {
    full_name: string | null;
    email: string;
    phone: string | null;
  } | null;
  order_status_history: OrderHistory[] | null;
  orders_child: ChildOrder[] | null;
}

interface Payment {
  id: string;
  purpose: string;
  amount: number | string;
  refunded_amount: number | string;
  status: string;
  provider: string;
  business_sync_status: string;
  created_at: string;
  payment_transactions: {
    id: string;
    type: string;
    provider: string;
    provider_txn_id: string;
    amount: number | string;
    status: string;
    response: Record<string, unknown> | null;
    created_at: string;
  }[] | null;
  refunds: {
    id: string;
    amount: number | string;
    reason: string | null;
    status: string;
    provider_refund_id: string | null;
    confirmed_at: string | null;
    created_at: string;
  }[] | null;
}

interface AdminRequest {
  id: string;
  request_type: string;
  status: string;
  reason: string;
  received_via: string | null;
  refund_id: string | null;
  created_at: string;
}

interface TimelineItem {
  at: string;
  title: string;
  detail: string;
  actor: string;
}

const orderStatusLabels: Record<string, string> = {
  CREATED: 'Đang tạo',
  PAYMENT_PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PENDING_ACCEPTANCE: 'Chờ tiếp nhận',
  ACCEPTED: 'Đã tiếp nhận',
  PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Hoàn thành',
  RETURNED: 'Đã trả hàng',
  REJECTED_BY_PARTNER: 'Doanh nghiệp từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
};

const paymentStatusLabels: Record<string, string> = {
  CREATED: 'Chờ thanh toán',
  PENDING: 'Chờ xác nhận',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  EXPIRED: 'Hết hạn',
  REFUNDED: 'Đã hoàn tiền',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
  CANCELLED: 'Đã hủy',
};

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function aggregateOrderStatus(parentStatus: string, children: ChildOrder[]) {
  if (children.length === 0) return parentStatus;
  const statuses = children.map((child) => child.status);
  if (statuses.every((status) => ['CANCELLED', 'REJECTED_BY_PARTNER'].includes(status))) return 'CANCELLED';
  if (statuses.every((status) => status === 'RETURNED')) return 'RETURNED';
  if (statuses.every((status) => status === 'COMPLETED')) return 'COMPLETED';
  if (statuses.every((status) => ['DELIVERED', 'COMPLETED'].includes(status))) return 'DELIVERED';
  if (statuses.includes('SHIPPED')) return 'SHIPPED';
  if (statuses.includes('PROCESSING')) return 'PROCESSING';
  if (statuses.includes('ACCEPTED')) return 'ACCEPTED';
  if (statuses.includes('PENDING_ACCEPTANCE')) return 'PENDING_ACCEPTANCE';
  return parentStatus;
}

function formatAddress(address: Record<string, unknown> | null, customer: ParentOrder['users']) {
  const shipping = address ?? {};
  const fields = [
    shipping.address,
    shipping.ward,
    shipping.district,
    shipping.city,
  ].filter((field): field is string => typeof field === 'string' && field.trim().length > 0);
  return {
    receiver: typeof shipping.receiver_name === 'string' ? shipping.receiver_name : customer?.full_name,
    phone: typeof shipping.phone === 'string' ? shipping.phone : customer?.phone,
    address: fields.length > 0 ? fields.join(', ') : null,
    note: typeof shipping.note === 'string' && shipping.note.trim() ? shipping.note : null,
  };
}

function actorName(actorId: string | null, actorRole: string | null, actors: Map<string, string>) {
  if (actorId) return actors.get(actorId) ?? actorId;
  if (actorRole === 'SYSTEM') return 'Hệ thống';
  return actorRole === 'ADMIN' ? 'Quản trị viên' : actorRole ?? 'Hệ thống';
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;
  const supabase = await supabaseServer();
  const [
    { data: orderData, error: orderError },
    { data: paymentData, error: paymentError },
    { data: requestsData, error: requestsError },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select('id, code, status, subtotal, discount, shipping_fee, total, placed_at, shipping_address, users!orders_customer_id_fkey(full_name, email, phone), order_status_history(id, from_status, to_status, actor_id, actor_role, reason, created_at), orders_child:orders!parent_order_id(id, code, status, subtotal, discount, shipping_fee, total, partner_id, partner_profiles(business_name), order_items(product_name, product_image, partner_id, unit_price, qty, line_total), order_status_history(id, from_status, to_status, actor_id, actor_role, reason, created_at), order_shipments(order_id, carrier_name, tracking_number, handed_over_at, delivered_at))')
      .eq('id', id)
      .eq('order_level', 'PARENT')
      .maybeSingle(),
    supabase
      .from('payments')
      .select('id, purpose, amount, refunded_amount, status, provider, business_sync_status, created_at, payment_transactions(id, type, provider, provider_txn_id, amount, status, response, created_at), refunds(id, amount, reason, status, provider_refund_id, confirmed_at, created_at)')
      .eq('purpose', 'ORDER')
      .eq('reference_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_admin_requests')
      .select('id, request_type, status, reason, received_via, refund_id, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: false }),
  ]);
  if (orderError) throw new Error(orderError.message);
  if (paymentError) throw new Error(paymentError.message);
  if (requestsError) throw new Error(requestsError.message);
  if (!orderData) notFound();

  const order = orderData as unknown as ParentOrder;
  const children = [...(order.orders_child ?? [])].sort((a, b) => a.code.localeCompare(b.code));
  const payments = (paymentData ?? []) as unknown as Payment[];
  const requests = (requestsData ?? []) as AdminRequest[];
  const customer = order.users;
  const address = formatAddress(order.shipping_address, customer);
  const overallStatus = aggregateOrderStatus(order.status, children);
  const history = children.flatMap((child) => (child.order_status_history ?? []).map((entry) => ({
    ...entry,
    childCode: child.code,
  })));
  const parentHistory = (order.order_status_history ?? []).map((entry) => ({
    ...entry,
    childCode: order.code,
  }));
  const allHistory = [...parentHistory, ...history];
  const confirmedByIds = payments.flatMap((payment) =>
    (payment.payment_transactions ?? []).flatMap((transaction) =>
      typeof transaction.response?.confirmed_by === 'string'
        ? [transaction.response.confirmed_by]
        : [],
    ),
  );
  const actorIds = [...new Set([
    ...allHistory.map((entry) => entry.actor_id).filter((value): value is string => Boolean(value)),
    ...confirmedByIds,
  ])];
  let actors = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actorRows, error: actorError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', actorIds);
    if (actorError) throw new Error(actorError.message);
    actors = new Map((actorRows ?? []).map((actor) => [actor.id, actor.full_name || actor.email]));
  }

  const timeline: TimelineItem[] = [
    {
      at: order.placed_at,
      title: 'Đặt hàng',
      detail: `Đơn tổng ${order.code}`,
      actor: customer?.full_name || customer?.email || 'Khách hàng',
    },
    ...allHistory.map((entry) => ({
      at: entry.created_at,
      title: `${orderStatusLabels[entry.to_status] ?? entry.to_status} · ${entry.childCode}`,
      detail: [
        entry.from_status ? `${orderStatusLabels[entry.from_status] ?? entry.from_status} → ${orderStatusLabels[entry.to_status] ?? entry.to_status}` : '',
        entry.reason ?? '',
      ].filter(Boolean).join(' · '),
      actor: actorName(entry.actor_id, entry.actor_role, actors),
    })),
    ...payments.flatMap((payment) => (payment.payment_transactions ?? []).map((transaction) => {
      const confirmer =
        typeof transaction.response?.confirmed_by === 'string'
          ? actors.get(transaction.response.confirmed_by) ?? transaction.response.confirmed_by
          : null;
      return {
        at: transaction.created_at,
        title: transaction.type === 'PAYMENT' ? 'Thanh toán' : 'Hoàn tiền',
        detail: `${transaction.provider} · ${transaction.provider_txn_id} · ${formatVnd(transaction.amount)}`,
        actor: confirmer ?? (transaction.provider === 'BANK_TRANSFER' ? 'Quản trị viên' : 'Cổng thanh toán'),
      };
    })),
    ...children.flatMap((child) => {
      const shipment = firstRelation(child.order_shipments);
      if (!shipment) return [];
      return [
        ...(shipment.handed_over_at ? [{
          at: shipment.handed_over_at,
          title: `Bàn giao vận chuyển · ${child.code}`,
          detail: `${shipment.carrier_name} · ${shipment.tracking_number}`,
          actor: 'Quản trị viên',
        }] : []),
        ...(shipment.delivered_at ? [{
          at: shipment.delivered_at,
          title: `Giao hàng · ${child.code}`,
          detail: `${shipment.carrier_name} · ${shipment.tracking_number}`,
          actor: 'Đơn vị vận chuyển',
        }] : []),
      ];
    }),
    ...requests.map((request) => ({
      at: request.created_at,
      title: request.request_type === 'CANCELLATION' ? 'Xử lý yêu cầu hủy' : 'Xử lý yêu cầu trả hàng',
      detail: `${request.reason}${request.received_via ? ` · Nhận qua: ${request.received_via}` : ''}`,
      actor: 'Quản trị viên',
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const canCancel =
    ['CREATED', 'PAYMENT_PENDING'].includes(order.status) &&
    children.length > 0 &&
    children.every((child) => child.status === 'CREATED') &&
    !payments.some((payment) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status));

  return (
    <div>
      <Link href="/admin/orders" className="text-sm font-medium text-emerald-800 hover:underline">
        ← Quay lại danh sách đơn hàng
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Chi tiết đơn hàng {order.code}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Đặt {formatDate(order.placed_at)} · {children.length} phần đơn theo doanh nghiệp
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
          {orderStatusLabels[overallStatus] ?? overallStatus}
        </span>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Thông tin chung</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Mã đơn hàng</dt><dd className="font-mono font-medium">{order.code}</dd></div>
            <div><dt className="text-slate-500">Ngày đặt</dt><dd>{formatDate(order.placed_at)}</dd></div>
            <div><dt className="text-slate-500">Khách hàng</dt><dd>{address.receiver || customer?.email || '—'}</dd></div>
            <div><dt className="text-slate-500">Số điện thoại</dt><dd>{address.phone || '—'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate-500">Địa chỉ nhận hàng</dt><dd>{address.address || 'Chưa lưu địa chỉ nhận hàng trong đơn hàng.'}</dd></div>
            {address.note && <div className="sm:col-span-2"><dt className="text-slate-500">Ghi chú giao hàng</dt><dd>{address.note}</dd></div>}
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Thông tin thanh toán</h2>
          {payments.map((payment) => (
            <article key={payment.id} className="mt-3 rounded-lg border border-slate-100 p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{payment.provider} · {formatVnd(payment.amount)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{paymentStatusLabels[payment.status] ?? payment.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Tạo {formatDate(payment.created_at)} · Đã hoàn {formatVnd(payment.refunded_amount)}
              </p>
              {(payment.payment_transactions ?? []).map((transaction) => (
                <p key={transaction.id} className="mt-1 break-all text-xs text-slate-600">
                  {transaction.type === 'PAYMENT' ? 'Mã giao dịch' : 'Mã hoàn tiền'}: {transaction.provider_txn_id}
                  {' · '}{formatDate(transaction.created_at)} · {transaction.status}
                </p>
              ))}
              <p className="mt-1 text-xs text-slate-500">
                Đồng bộ nghiệp vụ: {payment.business_sync_status}
              </p>
            </article>
          ))}
          {payments.length === 0 && <p className="mt-3 text-sm text-slate-500">Chưa có giao dịch thanh toán.</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
            <div><dt className="text-slate-500">Tổng tiền hàng</dt><dd>{formatVnd(order.subtotal)}</dd></div>
            <div><dt className="text-slate-500">Giảm giá</dt><dd>{formatVnd(order.discount)}</dd></div>
            <div><dt className="text-slate-500">Phí vận chuyển</dt><dd>{formatVnd(order.shipping_fee)}</dd></div>
            <div><dt className="font-medium text-slate-700">Tổng thanh toán</dt><dd className="font-bold text-rose-700">{formatVnd(order.total)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Các phần đơn và sản phẩm theo doanh nghiệp</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tiến độ của từng doanh nghiệp được giữ riêng; trạng thái đơn tổng được tổng hợp từ các phần đơn.
        </p>
        <div className="mt-3 space-y-4">
          {children.map((child) => {
            const partner = firstRelation(child.partner_profiles);
            const shipment = firstRelation(child.order_shipments);
            return (
              <article key={child.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
                  <div>
                    <p className="font-semibold">{partner?.business_name ?? 'Doanh nghiệp cung cấp'}</p>
                    <p className="mt-1 text-xs text-slate-500">Phần đơn {child.code}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                      {orderStatusLabels[child.status] ?? child.status}
                    </span>
                    <p className="mt-1 text-sm font-semibold">{formatVnd(child.total)}</p>
                  </div>
                </header>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="border-b border-slate-100 text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Sản phẩm</th>
                        <th className="px-4 py-3">Doanh nghiệp</th>
                        <th className="px-4 py-3">Số lượng</th>
                        <th className="px-4 py-3">Đơn giá</th>
                        <th className="px-4 py-3">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(child.order_items ?? []).map((item, index) => (
                        <tr key={`${child.id}-${index}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {item.product_image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.product_image} alt={item.product_name} className="h-12 w-12 rounded-lg object-cover" />
                              ) : (
                                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">Không ảnh</span>
                              )}
                              <span className="font-medium">{item.product_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">{partner?.business_name ?? '—'}</td>
                          <td className="px-4 py-3">{item.qty}</td>
                          <td className="whitespace-nowrap px-4 py-3">{formatVnd(item.unit_price)}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium">{formatVnd(item.line_total)}</td>
                        </tr>
                      ))}
                      {(!child.order_items || child.order_items.length === 0) && (
                        <tr><td colSpan={5} className="px-4 py-5 text-center text-slate-500">Phần đơn chưa có sản phẩm.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 border-t border-slate-100 p-4 xl:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-semibold">Thông tin vận chuyển</h3>
                    {shipment && (
                      <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                        <div><dt className="inline text-slate-500">Đơn vị: </dt><dd className="inline">{shipment.carrier_name}</dd></div>
                        <div><dt className="inline text-slate-500">Mã vận đơn: </dt><dd className="inline break-all">{shipment.tracking_number}</dd></div>
                        <div><dt className="inline text-slate-500">Bàn giao: </dt><dd className="inline">{shipment.handed_over_at ? formatDate(shipment.handed_over_at) : 'Chưa cập nhật'}</dd></div>
                        <div><dt className="inline text-slate-500">Giao hàng: </dt><dd className="inline">{shipment.delivered_at ? formatDate(shipment.delivered_at) : 'Chưa cập nhật'}</dd></div>
                      </dl>
                    )}
                    {!shipment && <p className="mt-1 text-xs text-slate-500">Chưa có thông tin vận chuyển.</p>}
                    {['SHIPPED', 'DELIVERED', 'COMPLETED'].includes(child.status) && (
                      <OrderShipmentForm orderId={child.id} initial={shipment} />
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Lịch sử phần đơn</h3>
                    <ol className="mt-2 space-y-2 border-l border-emerald-200 pl-3">
                      {[...(child.order_status_history ?? [])]
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .map((entry) => (
                          <li key={entry.id} className="relative text-xs">
                            <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-emerald-600" />
                            <p className="font-medium">{orderStatusLabels[entry.to_status] ?? entry.to_status}</p>
                            <p className="text-slate-500">
                              {formatDate(entry.created_at)} · {actorName(entry.actor_id, entry.actor_role, actors)}
                              {entry.reason ? ` · ${entry.reason}` : ''}
                            </p>
                          </li>
                        ))}
                      {(child.order_status_history ?? []).length === 0 && (
                        <li className="text-xs text-slate-500">Chưa có lịch sử trạng thái.</li>
                      )}
                    </ol>
                  </div>
                </div>
              </article>
            );
          })}
          {children.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Đơn hàng chưa có phần đơn theo doanh nghiệp.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Lịch sử đơn hàng và thao tác</h2>
        <ol className="mt-4 space-y-3 border-l border-emerald-200 pl-4">
          {timeline.map((item, index) => (
            <li key={`${item.at}-${item.title}-${index}`} className="relative">
              <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-600" />
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-slate-600">{item.detail}</p>
              <p className="text-xs text-slate-400">{formatDate(item.at)} · {item.actor}</p>
            </li>
          ))}
        </ol>
        {requests.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold">Yêu cầu hủy / trả hàng đã ghi nhận</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {requests.map((request) => (
                <li key={request.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="font-medium">
                    {request.request_type === 'CANCELLATION' ? 'Yêu cầu hủy' : 'Yêu cầu trả hàng'} · {request.status}
                  </p>
                  <p className="mt-1 text-slate-600">{request.reason}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(request.created_at)}{request.received_via ? ` · Nhận qua ${request.received_via}` : ''}
                    {request.refund_id ? ` · Hoàn tiền ${request.refund_id.slice(0, 8)}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <OrderAdminActions
        orderId={order.id}
        orderStatus={canCancel ? order.status : overallStatus}
        payments={payments}
      />
    </div>
  );
}
