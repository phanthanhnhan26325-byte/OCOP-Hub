import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPartnerOrderDetail } from '@/modules/orders/partner-orders.service';
import { orderDate, orderStatuses } from '@/modules/orders/partner-order-view';
import { formatVnd } from '@/lib/money';
import { OrderBadge } from '@/components/partner/OrderBadge';
import { SubOrderActions } from '@/components/partner/SubOrderActions';
import { PartnerIcon } from '@/components/partner/PartnerIcon';
import { OrderReturnRequests } from '@/components/partner/OrderReturnRequests';

export const dynamic = 'force-dynamic';

const steps = ['PENDING_ACCEPTANCE', 'ACCEPTED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
const actionCopy: Record<string, [string, string]> = {
  PENDING_ACCEPTANCE: ['Đơn hàng đang chờ phản hồi', 'Vui lòng kiểm tra thông tin và khả năng đáp ứng trước khi tiếp nhận.'],
  ACCEPTED: ['Đơn hàng đã được tiếp nhận', 'Bắt đầu chuẩn bị sản phẩm để giao cho khách hàng.'],
  PROCESSING: ['Đơn hàng đang được chuẩn bị', 'Khi bàn giao cho đơn vị vận chuyển, hãy cập nhật sang trạng thái đang giao.'],
  SHIPPED: ['Đơn hàng đang được giao', 'Xác nhận khách đã nhận hàng khi có thông tin giao hàng thành công.'],
  DELIVERED: ['Khách hàng đã nhận đơn', 'Khách hàng sẽ xác nhận hoàn thành hoặc gửi yêu cầu trả hàng; doanh nghiệp không thể tự xác nhận hoàn thành thay khách.'],
  COMPLETED: ['Đơn hàng đã hoàn thành', 'Bạn có thể xem lại thông tin và lịch sử xử lý bên dưới.'],
  REJECTED_BY_PARTNER: ['Doanh nghiệp đã từ chối đơn hàng', 'Lý do từ chối được lưu trong lịch sử xử lý.'],
  CANCELLED: ['Đơn hàng đã bị hủy', 'Đơn này không thể tiếp tục chuyển trạng thái xử lý.'],
  EXPIRED: ['Đơn hàng đã hết hạn', 'Đơn này không thể tiếp tục chuyển trạng thái xử lý.'],
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="text-[11px] partner-muted">{label}</dt><dd className="mt-1.5 break-words text-sm font-medium leading-6">{value || 'Chưa có thông tin'}</dd></div>;
}

export default async function PartnerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPartnerOrderDetail(id);
  if (!data) notFound();
  const { order, history, customerEmail, returnRequests } = data;
  const shipping = order.shipping_address;
  const activeStep = steps.indexOf(order.status);
  const returnRequestPending = returnRequests.some(request => request.status === 'REQUESTED');
  const [defaultActionTitle, defaultActionDescription] = actionCopy[order.status] ?? [orderStatuses[order.status] || order.status, 'Thông tin và lịch sử của phần đơn được hiển thị bên dưới.'];
  const actionTitle = returnRequestPending ? 'Khách hàng yêu cầu trả hàng / hoàn tiền' : defaultActionTitle;
  const actionDescription = returnRequestPending
    ? 'Vui lòng xem lý do, hình ảnh và thông tin liên hệ bên dưới, sau đó phản hồi yêu cầu của khách hàng.'
    : defaultActionDescription;
  const paidAt = order.payment?.payment_transactions.filter(transaction => transaction.type === 'PAYMENT' && transaction.status === 'SUCCESS').sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.created_at;

  return <div className="w-full">
    <Link href="/partner/orders" className="inline-flex items-center gap-1 text-xs font-medium text-[#195c46] hover:underline">← Quay lại danh sách đơn</Link>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-medium tracking-tight sm:text-[32px]">{order.code}</h1><p className="mt-2 text-sm leading-6 partner-muted">{order.parent_code ? `Thuộc đơn chung ${order.parent_code} · ` : ''}Đặt lúc {orderDate(order.placed_at)}</p></div>
      <div className="flex flex-wrap gap-2"><OrderBadge status={order.payment?.status ?? 'UNKNOWN'} payment /><OrderBadge status={order.status} /></div>
    </div>

    <section aria-label="Tiến trình xử lý đơn" className="partner-panel mt-7 overflow-x-auto p-5 sm:p-6">
      <ol className="flex min-w-[800px] items-center">{steps.map((step, index) => <li key={step} aria-current={index === activeStep ? 'step' : undefined} className="flex flex-1 items-center gap-2 last:flex-none"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] ${index <= activeStep ? 'border-[#195c46] bg-[#195c46] text-white' : 'border-[#cdded5] text-[#738787]'}`}>{index < activeStep ? <PartnerIcon name="check" className="!h-3.5 !w-3.5" /> : index + 1}</span><span className={`whitespace-nowrap text-[11px] ${index <= activeStep ? 'font-medium text-[#195c46]' : 'partner-muted'}`}>{orderStatuses[step]}</span>{index < steps.length - 1 && <span aria-hidden="true" className={`mx-2 h-px min-w-3 flex-1 ${index < activeStep ? 'bg-[#195c46]' : 'bg-[#dce6e1]'}`} />}</li>)}</ol>
    </section>

    <section
      role={returnRequestPending ? 'alert' : undefined}
      className={`mt-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border px-5 py-5 sm:px-6 ${
        returnRequestPending
          ? 'border-red-300 bg-red-50 text-red-800'
          : order.status === 'PENDING_ACCEPTANCE'
            ? 'border-[#eddfb4] bg-[#fff9e9]'
            : 'border-[#dce6e1] bg-white'
      }`}
    >
      <div className="min-w-0 flex-1">
        <h2 className={`text-sm font-semibold ${returnRequestPending ? 'text-red-800' : ''}`}>{actionTitle}</h2>
        <p className={`mt-2 text-xs leading-5 ${returnRequestPending ? 'text-red-700' : 'partner-muted'}`}>{actionDescription}</p>
      </div>
      <div className="w-full sm:max-w-xl"><SubOrderActions key={`${order.id}:${order.status}`} orderId={order.id} status={order.status} /></div>
    </section>

    <div className="mt-6">
    <OrderReturnRequests orderId={order.id} requests={returnRequests} />
    </div>

    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2.5fr)_minmax(280px,1fr)]">
      <div className="min-w-0 space-y-6">
        <section className="partner-panel p-5 sm:p-6">
          <h2 className="border-b border-[#eaf0ec] pb-5 text-lg font-medium">Sản phẩm trong phần đơn</h2>
          <ul className="divide-y divide-[#eaf0ec]">{order.order_items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 py-5 sm:gap-4">
            {item.product_image ? <img src={item.product_image} alt={item.product_name} className="h-14 w-14 shrink-0 rounded-lg object-cover" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="box" /></span>}
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-6">{item.product_name}</p><p className="mt-1 text-xs partner-muted">Số lượng: {item.qty}</p></div>
            <div className="ml-auto flex gap-6 text-xs sm:gap-10"><div><p className="text-[10px] partner-muted">Đơn giá</p><p className="mt-1 whitespace-nowrap">{formatVnd(item.unit_price)}</p></div><div className="text-right"><p className="text-[10px] partner-muted">Thành tiền</p><p className="mt-1 whitespace-nowrap font-semibold">{formatVnd(item.line_total)}</p></div></div>
          </li>)}</ul>
          {order.order_items.length === 0 && <p className="py-6 text-sm partner-muted">Chưa có thông tin sản phẩm trong phần đơn.</p>}
          <dl className="ml-auto mt-4 max-w-sm space-y-3 border-t border-[#dce6e1] pt-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="partner-muted">Tiền hàng</dt><dd className="font-semibold">{formatVnd(order.subtotal)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="partner-muted">Phí giao nhận</dt><dd className="font-semibold">{formatVnd(order.shipping_fee)}</dd></div>
            {Number(order.discount) !== 0 && <div className="flex justify-between gap-3"><dt className="partner-muted">Giảm giá</dt><dd className="font-semibold">−{formatVnd(order.discount)}</dd></div>}
            <div className="flex justify-between gap-3 border-t border-[#dce6e1] pt-4 text-base text-[#195c46]"><dt>Tổng phần đơn</dt><dd className="font-bold">{formatVnd(order.total)}</dd></div>
          </dl>
        </section>

        <section className="partner-panel p-5 sm:p-6">
          <h2 className="border-b border-[#eaf0ec] pb-5 text-lg font-medium">Lịch sử xử lý</h2>
          <ol className="mt-5 space-y-5">{history.map(event => <li key={event.id} className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#195c46]" /><div className="min-w-0"><p className="text-sm font-medium">{orderStatuses[event.to_status] ?? event.to_status}</p><p className="mt-1 text-[11px] partner-muted">{orderDate(event.created_at)} · {event.actor_role === 'PARTNER' ? 'Doanh nghiệp' : event.actor_role === 'ADMIN' ? 'Quản trị viên' : event.actor_role === 'CUSTOMER' ? 'Khách hàng' : 'Hệ thống'}</p>{event.reason && <p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-[#526c63]">{event.reason}</p>}</div></li>)}
            <li className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#cdded5]" /><div><p className="text-sm font-medium">Đơn hàng được đặt</p><p className="mt-1 text-[11px] partner-muted">{orderDate(order.placed_at)} · Khách hàng</p></div></li>
          </ol>
        </section>
      </div>

      <aside className="min-w-0 space-y-6">
        <section className="partner-panel p-5 sm:p-6"><h2 className="text-base font-medium">Thông tin người nhận</h2><dl className="mt-5 space-y-5"><Field label="Họ và tên" value={shipping.receiver_name} /><Field label="Số điện thoại" value={shipping.phone} /><Field label="Email tài khoản đặt hàng" value={customerEmail} /><Field label="Địa chỉ" value={[shipping.address, shipping.ward, shipping.district, shipping.city].filter(Boolean).join(', ')} /><Field label="Ghi chú giao hàng" value={shipping.note || 'Không có ghi chú'} /></dl></section>
        <section className="partner-panel p-5 sm:p-6"><h2 className="text-base font-medium">Thanh toán</h2><div className="mt-4"><OrderBadge status={order.payment?.status ?? 'UNKNOWN'} payment /></div><dl className="mt-5 space-y-5"><Field label="Kênh thanh toán" value={order.payment ? (order.payment.provider === 'mock' ? 'Thanh toán thử nghiệm' : order.payment.provider.toUpperCase()) : null} /><Field label="Thời điểm thanh toán thành công" value={paidAt ? orderDate(paidAt) : 'Chưa ghi nhận'} /><Field label="Giá trị phần đơn" value={formatVnd(order.total)} /></dl><p className="mt-5 border-t border-[#eaf0ec] pt-4 text-xs leading-6 partner-muted">Khách thanh toán cho OCOP Hub theo đơn chung. Khoản doanh nghiệp được nhận sẽ được tính riêng khi đối soát.</p><Link href="/partner/settlements" className="mt-3 inline-flex text-xs font-medium text-[#195c46] hover:underline">Xem đối soát & thanh toán →</Link></section>
      </aside>
    </div>
  </div>;
}
