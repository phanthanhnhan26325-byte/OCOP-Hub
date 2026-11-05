import Link from 'next/link';
import { getPartnerOrders } from '@/modules/orders/partner-orders.service';
import { filterPartnerOrders, orderDate, orderStatuses, paymentStatuses } from '@/modules/orders/partner-order-view';
import { formatVnd } from '@/lib/money';
import { OrderBadge } from '@/components/partner/OrderBadge';
import { PartnerIcon } from '@/components/partner/PartnerIcon';

export const dynamic = 'force-dynamic';
type Query = Record<string, string | string[] | undefined>;

export default async function PartnerOrdersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  const filters = {
    q: text('q').trim().slice(0, 100),
    days: ['all', '7', '30', '90'].includes(text('days')) ? text('days') : '30',
    status: Object.hasOwn(orderStatuses, text('status')) ? text('status') : '',
    payment: Object.hasOwn(paymentStatuses, text('payment')) ? text('payment') : '',
  };
  const all = await getPartnerOrders();
  const orders = filterPartnerOrders(all, filters, new Date());
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(orders.length / pageSize));
  const requestedPage = Number(text('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
  const offset = (page - 1) * pageSize;
  const visible = orders.slice(offset, offset + pageSize);
  const pageHref = (value: number) => `/partner/orders?${new URLSearchParams({ ...filters, page: String(value) })}`;
  const startPage = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => startPage + index);
  const hasFilter = Boolean(filters.q || filters.status || filters.payment || filters.days !== 'all');

  return <div className="mx-auto max-w-[1568px] px-4 py-8 sm:px-6 sm:py-10">
    <h1 className="text-2xl font-medium tracking-tight sm:text-[32px]">Đơn hàng</h1>
    <p className="mt-2 text-sm leading-6 partner-muted">Theo dõi và xử lý các phần đơn thuộc doanh nghiệp bạn.</p>
    <section aria-label="Danh sách đơn hàng" className="partner-panel mt-7 overflow-hidden p-5 sm:p-6">
      <form key={JSON.stringify(filters)} action="/partner/orders" method="get" className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr_auto]">
        <label className="text-xs font-medium">Tìm kiếm
          <span className="relative mt-2 block"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="absolute left-3 top-3 h-4 w-4 text-[#738787]"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input type="search" name="q" defaultValue={filters.q} maxLength={100} placeholder="Mã đơn, tên hoặc số điện thoại…" className="w-full rounded-lg border border-[#dce6e1] bg-white py-2.5 pl-10 pr-3 text-sm font-normal" /></span>
        </label>
        <label className="text-xs font-medium">Thời gian đặt
          <select name="days" defaultValue={filters.days} className="mt-2 w-full rounded-lg border border-[#dce6e1] bg-white px-3 py-2.5 text-sm font-normal"><option value="all">Tất cả thời gian</option><option value="7">7 ngày gần đây</option><option value="30">30 ngày gần đây</option><option value="90">90 ngày gần đây</option></select>
        </label>
        <label className="text-xs font-medium">Xử lý đơn
          <select name="status" defaultValue={filters.status} className="mt-2 w-full rounded-lg border border-[#dce6e1] bg-white px-3 py-2.5 text-sm font-normal"><option value="">Mọi trạng thái xử lý</option>{Object.entries(orderStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <label className="text-xs font-medium">Thanh toán
          <select name="payment" defaultValue={filters.payment} className="mt-2 w-full rounded-lg border border-[#dce6e1] bg-white px-3 py-2.5 text-sm font-normal"><option value="">Mọi trạng thái thanh toán</option>{Object.entries(paymentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <button type="submit" className="rounded-lg bg-[#195c46] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#124a37]">Lọc đơn</button>
      </form>
      <div className="my-4 flex flex-wrap items-center justify-between gap-2 text-xs"><p className="partner-muted"><b className="text-[#195c46]">{orders.length}</b> đơn hàng phù hợp</p>{hasFilter && <Link href="/partner/orders?days=all" className="font-medium text-[#195c46] hover:underline">Xóa bộ lọc</Link>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-xs">
        <caption className="sr-only">Đơn hàng của doanh nghiệp, sắp xếp mới nhất trước</caption>
        <thead className="border-y border-[#dce6e1] bg-[#f7faf8] partner-muted"><tr>{['Mã phần đơn', 'Khách hàng', 'Sản phẩm', 'Ngày đặt', 'Số tiền', 'Trạng thái xử lý', 'Thanh toán', 'Thao tác'].map(label => <th key={label} scope="col" className="px-3 py-4 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#eaf0ec]">{visible.map(order => <tr key={order.id} id={order.id} className="scroll-mt-28 hover:bg-[#f7faf8]">
          <td className="px-3 py-5"><Link href={`/partner/orders/${order.id}`} className="whitespace-nowrap font-semibold text-[#195c46] hover:underline">{order.code}</Link><p className="mt-1 text-[10px] partner-muted">Đơn chung: {order.parent_code || '—'}</p></td>
          <td className="px-3 py-5"><p className="font-medium">{order.shipping_address.receiver_name || 'Chưa có tên người nhận'}</p>{order.shipping_address.phone && <p className="mt-1 text-[11px] partner-muted">{order.shipping_address.phone}</p>}</td>
          <td className="max-w-48 px-3 py-5"><p className="line-clamp-2 leading-5">{order.order_items[0]?.product_name || '—'}</p><p className="mt-1 text-[10px] partner-muted">{order.order_items.reduce((sum, item) => sum + item.qty, 0)} sản phẩm{order.order_items.length > 1 ? ` · ${order.order_items.length} loại` : ''}</p></td>
          <td className="whitespace-nowrap px-3 py-5 partner-muted">{orderDate(order.placed_at)}</td>
          <td className="whitespace-nowrap px-3 py-5 font-semibold">{formatVnd(order.total)}</td>
          <td className="px-3 py-5"><OrderBadge status={order.status} /></td>
          <td className="px-3 py-5"><OrderBadge status={order.payment?.status ?? 'UNKNOWN'} payment /></td>
          <td className="px-3 py-5"><Link href={`/partner/orders/${order.id}`} className="whitespace-nowrap font-medium text-[#195c46] hover:underline">Chi tiết</Link></td>
        </tr>)}</tbody>
      </table></div>
      {!visible.length && <div className="py-14 text-center"><span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="bag" /></span><h2 className="text-sm font-medium">{all.length ? 'Không có đơn hàng phù hợp' : 'Chưa có đơn hàng nào'}</h2><p className="mt-2 text-xs partner-muted">{all.length ? 'Thử thay đổi từ khóa hoặc bộ lọc.' : 'Các đơn hàng mới của khách sẽ xuất hiện tại đây.'}</p></div>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs partner-muted"><p>Hiển thị {orders.length ? offset + 1 : 0}–{Math.min(offset + pageSize, orders.length)} trong {orders.length} đơn</p><nav aria-label="Phân trang đơn hàng" className="flex items-center gap-1.5">
        {page > 1 && <Link href={pageHref(page - 1)} aria-label="Trang trước" className="rounded-lg border border-[#dce6e1] px-3 py-2">‹</Link>}
        {pages.map(value => <Link key={value} href={pageHref(value)} aria-current={value === page ? 'page' : undefined} className={`rounded-lg border px-3 py-2 ${value === page ? 'border-[#195c46] bg-[#195c46] text-white' : 'border-[#dce6e1] hover:bg-[#eaf4ee]'}`}>{value}</Link>)}
        {page < pageCount && <Link href={pageHref(page + 1)} aria-label="Trang sau" className="rounded-lg border border-[#dce6e1] px-3 py-2">›</Link>}
      </nav></div>
      <p className="mt-4 text-[10px] leading-5 partner-muted">Trạng thái thanh toán được ghi nhận theo đơn chung. Số tiền hiển thị chỉ thuộc phần đơn của doanh nghiệp bạn.</p>
    </section>
  </div>;
}
