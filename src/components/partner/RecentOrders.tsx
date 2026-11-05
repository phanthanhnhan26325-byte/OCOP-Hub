import Link from 'next/link';
import { formatVnd } from '@/lib/money';
import { PartnerIcon } from './PartnerIcon';

export interface RecentOrder {
  id: string;
  parent_order_id: string | null;
  code: string;
  status: string;
  total: number | string;
  placed_at: string;
  shipping_address: { receiver_name?: string } | null;
  order_items: { product_name: string; qty: number }[];
}

const statuses: Record<string, string> = {
  CREATED: 'Chờ thanh toán', PAYMENT_PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán',
  PENDING_ACCEPTANCE: 'Chờ tiếp nhận', ACCEPTED: 'Đã tiếp nhận', PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao', DELIVERED: 'Đã giao', COMPLETED: 'Hoàn thành',
  REJECTED_BY_PARTNER: 'Đã từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
};

function statusTone(status: string) {
  if (['PENDING_ACCEPTANCE', 'PARTIALLY_REFUNDED'].includes(status)) return 'bg-[#fcf3d9] text-[#9b7418]';
  if (['REJECTED_BY_PARTNER', 'CANCELLED'].includes(status)) return 'bg-[#fae9e7] text-[#cc4943]';
  if (['PAID', 'DELIVERED', 'COMPLETED'].includes(status)) return 'bg-[#eaf4ee] text-[#195c46]';
  if (['ACCEPTED', 'PROCESSING', 'SHIPPED'].includes(status)) return 'bg-blue-50 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <section aria-labelledby="recent-orders-title" className="partner-panel mt-6 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[#eaf0ec] px-5 py-6 sm:px-6">
        <div>
          <h2 id="recent-orders-title" className="text-lg font-medium">Đơn hàng gần đây</h2>
          <p className="mt-1 text-xs leading-5 partner-muted">5 đơn hàng mới nhất của doanh nghiệp</p>
        </div>
        <Link href="/partner/orders" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#195c46] hover:underline">Xem tất cả<PartnerIcon name="chevron" className="!h-3.5 !w-3.5" /></Link>
      </div>
      {orders.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="bag" /></span>
          <p className="text-sm font-medium">Chưa có đơn hàng nào</p>
          <p className="mt-2 text-xs leading-5 partner-muted">Các đơn hàng mới từ khách hàng sẽ xuất hiện tại đây.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs">
            <caption className="sr-only">Các đơn hàng mới nhất, sắp xếp theo thời gian đặt giảm dần</caption>
            <thead className="bg-[#f7faf8] partner-muted">
              <tr>{['Mã đơn hàng', 'Khách hàng', 'Sản phẩm', 'Ngày đặt', 'Tổng tiền', 'Trạng thái', ''].map((heading, index) => <th key={index} scope="col" className={`px-6 py-4 font-medium ${index === 4 ? 'text-right' : ''}`}>{heading || <span className="sr-only">Chi tiết</span>}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-[#eaf0ec]">
              {orders.map(order => {
                const href = `/partner/orders/${order.id}`;
                return <tr key={order.id} className="transition hover:bg-[#f7faf8]">
                  <td className="whitespace-nowrap px-6 py-5 font-semibold text-[#195c46]"><Link href={href} className="hover:underline">{order.code}</Link></td>
                  <td className="px-6 py-5">{order.shipping_address?.receiver_name || 'Khách hàng'}</td>
                  <td className="max-w-64 px-6 py-5"><p className="truncate" title={order.order_items.map(item => `${item.product_name} × ${item.qty}`).join(', ')}>{order.order_items[0]?.product_name || '—'}</p><p className="mt-1 text-[11px] partner-muted">{order.order_items.reduce((sum, item) => sum + item.qty, 0)} sản phẩm{order.order_items.length > 1 ? ` · ${order.order_items.length} loại` : ''}</p></td>
                  <td className="whitespace-nowrap px-6 py-5 partner-muted">{new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(order.placed_at))}</td>
                  <td className="whitespace-nowrap px-6 py-5 text-right font-semibold">{formatVnd(order.total)}</td>
                  <td className="px-6 py-5"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${statusTone(order.status)}`}><span aria-hidden="true">●</span>{statuses[order.status] ?? order.status}</span></td>
                  <td className="px-6 py-5"><Link href={href} aria-label={`Xem đơn hàng ${order.code}`} className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-[#195c46] hover:underline">Chi tiết<PartnerIcon name="chevron" className="!h-3.5 !w-3.5" /></Link></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
