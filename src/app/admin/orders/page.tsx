import Link from 'next/link';
import { OrderFilters } from '@/components/admin/OrderFilters';
import { requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatDate, formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

const pageSize = 20;
const orderStatuses = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'PENDING_ACCEPTANCE',
  'ACCEPTED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED',
  'RETURNED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'EXPIRED',
] as const;
const paymentStatuses = [
  'CREATED',
  'PENDING',
  'PAID',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CANCELLED',
] as const;

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
  REJECTED_BY_PARTNER: 'Đối tác từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  PARTIALLY_REFUNDED: 'Hoàn một phần',
};

const paymentStatusLabels: Record<string, string> = {
  CREATED: 'Chờ thanh toán',
  PENDING: 'Chờ xác nhận',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  EXPIRED: 'Hết hạn',
  REFUNDED: 'Đã hoàn tiền',
  PARTIALLY_REFUNDED: 'Hoàn một phần',
  CANCELLED: 'Đã hủy',
};

const badgeStyles: Record<string, string> = {
  CREATED: 'bg-slate-100 text-slate-700',
  PAYMENT_PENDING: 'bg-amber-50 text-amber-700',
  PENDING: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  PENDING_ACCEPTANCE: 'bg-amber-50 text-amber-700',
  ACCEPTED: 'bg-sky-50 text-sky-700',
  PROCESSING: 'bg-sky-50 text-sky-700',
  SHIPPED: 'bg-blue-50 text-blue-700',
  DELIVERED: 'bg-indigo-50 text-indigo-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  RETURNED: 'bg-rose-50 text-rose-700',
  FAILED: 'bg-red-50 text-red-700',
  EXPIRED: 'bg-slate-100 text-slate-600',
  REFUNDED: 'bg-rose-50 text-rose-700',
  PARTIALLY_REFUNDED: 'bg-rose-50 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

interface OrderRow {
  id: string;
  code: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_address: Record<string, unknown> | null;
  placed_at: string;
  quantity: number;
  subtotal: number | string;
  discount: number | string;
  shipping_fee: number | string;
  total: number | string;
  child_count: number;
  payment_id: string | null;
  payment_status: string | null;
  payment_amount: number | string | null;
  payment_provider: string | null;
}

interface OrderListResponse {
  total: number;
  page: number;
  page_size: number;
  orders: OrderRow[];
}

interface OrderMetrics {
  total: number;
  pending: number;
  shipping: number;
  completed: number;
}

function firstParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function statusLabel(status: string | null, labels: Record<string, string>) {
  if (!status) return 'Chưa có thanh toán';
  return labels[status] ?? status;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    payment?: string | string[];
    from?: string | string[];
    to?: string | string[];
    sort?: string | string[];
    page?: string | string[];
  }>;
}) {
  const admin = await requireRole('ADMIN');
  const params = await searchParams;
  const search = firstParam(params.q).trim().slice(0, 100);
  const orderStatus = orderStatuses.includes(firstParam(params.status) as (typeof orderStatuses)[number])
    ? firstParam(params.status)
    : '';
  const paymentStatus = paymentStatuses.includes(firstParam(params.payment) as (typeof paymentStatuses)[number])
    ? firstParam(params.payment)
    : '';
  const from = validDate(firstParam(params.from));
  const to = validDate(firstParam(params.to));
  const sortOptions = ['newest', 'oldest', 'total_desc', 'total_asc', 'code_asc'] as const;
  const requestedSort = firstParam(params.sort);
  const sort = sortOptions.includes(requestedSort as (typeof sortOptions)[number]) ? requestedSort : 'newest';
  const requestedPage = Math.max(1, Number.parseInt(firstParam(params.page), 10) || 1);
  const supabase = supabaseAdmin();

  const [{ data: metricsData, error: metricsError }, { data: ordersData, error: ordersError }] = await Promise.all([
    supabase.rpc('admin_order_dashboard_metrics', { p_admin: admin.id }),
    supabase.rpc('admin_list_orders', {
      p_admin: admin.id,
      p_search: search || null,
      p_order_status: orderStatus || null,
      p_payment_status: paymentStatus || null,
      p_from: from,
      p_to: to,
      p_sort: sort,
      p_page: requestedPage,
      p_page_size: pageSize,
    }),
  ]);
  if (metricsError) throw new Error(metricsError.message);
  if (ordersError) throw new Error(ordersError.message);

  const metrics = metricsData as unknown as OrderMetrics;
  let result = ordersData as unknown as OrderListResponse;
  const pageCount = Math.max(1, Math.ceil(result.total / pageSize));
  if (requestedPage > pageCount) {
    const { data, error } = await supabase.rpc('admin_list_orders', {
      p_admin: admin.id,
      p_search: search || null,
      p_order_status: orderStatus || null,
      p_payment_status: paymentStatus || null,
      p_from: from,
      p_to: to,
      p_sort: sort,
      p_page: pageCount,
      p_page_size: pageSize,
    });
    if (error) throw new Error(error.message);
    result = data as unknown as OrderListResponse;
  }

  const filters = new URLSearchParams();
  if (search) filters.set('q', search);
  if (orderStatus) filters.set('status', orderStatus);
  if (paymentStatus) filters.set('payment', paymentStatus);
  if (from) filters.set('from', from);
  if (to) filters.set('to', to);
  if (sort !== 'newest') filters.set('sort', sort);
  const pageHref = (page: number) => {
    const query = new URLSearchParams(filters);
    query.set('page', String(page));
    return `/admin/orders?${query.toString()}`;
  };
  const firstResult = result.total === 0 ? 0 : (result.page - 1) * pageSize + 1;
  const lastResult = Math.min(result.page * pageSize, result.total);

  return (
    <div>
      <h1 className="text-2xl font-bold">Quản lý đơn hàng</h1>
      <p className="mt-1 text-sm text-slate-500">
        Theo dõi đơn tổng và tiến độ từng doanh nghiệp; trạng thái tổng hợp từ các phần đơn.
      </p>

      <section aria-label="Thống kê đơn hàng" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Tổng đơn hàng', value: metrics.total, icon: '▣', style: 'bg-blue-50 text-blue-700' },
          { label: 'Đơn chờ xử lý', value: metrics.pending, icon: '◷', style: 'bg-amber-50 text-amber-700' },
          { label: 'Đơn đang giao', value: metrics.shipping, icon: '➜', style: 'bg-violet-50 text-violet-700' },
          { label: 'Đơn hoàn thành', value: metrics.completed, icon: '✓', style: 'bg-emerald-50 text-emerald-700' },
        ].map((metric) => (
          <div key={metric.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${metric.style}`}>
              {metric.icon}
            </span>
            <div>
              <p className="text-sm text-slate-500">{metric.label}</p>
              <p className="text-2xl font-bold">{metric.value.toLocaleString('vi-VN')}</p>
            </div>
          </div>
        ))}
      </section>

      <OrderFilters
        search={search}
        orderStatus={orderStatus}
        paymentStatus={paymentStatus}
        from={from}
        to={to}
        sort={sort}
        orderStatuses={orderStatuses}
        paymentStatuses={paymentStatuses}
        orderStatusLabels={orderStatusLabels}
        paymentStatusLabels={paymentStatusLabels}
      />

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1250px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-3">STT</th>
              <th className="px-3 py-3">Mã đơn hàng</th>
              <th className="px-3 py-3">Khách hàng</th>
              <th className="px-3 py-3">Ngày đặt</th>
              <th className="px-3 py-3">Số lượng</th>
              <th className="px-3 py-3">Tiền hàng</th>
              <th className="px-3 py-3">Giảm giá</th>
              <th className="px-3 py-3">Vận chuyển</th>
              <th className="px-3 py-3">Tổng thanh toán</th>
              <th className="px-3 py-3">Thanh toán</th>
              <th className="px-3 py-3">Trạng thái đơn</th>
              <th className="px-3 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {result.orders.map((order, index) => (
              <tr key={order.id} className="align-top hover:bg-slate-50/70">
                <td className="px-3 py-3 text-slate-500">{(result.page - 1) * pageSize + index + 1}</td>
                <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-800">{order.code}</td>
                <td className="px-3 py-3">
                  <p className="font-medium">{order.customer_name}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.customer_email}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(order.placed_at)}</td>
                <td className="px-3 py-3">{order.quantity}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatVnd(order.subtotal)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatVnd(order.discount)}</td>
                <td className="whitespace-nowrap px-3 py-3">{formatVnd(order.shipping_fee)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatVnd(order.total)}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyles[order.payment_status ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
                    {statusLabel(order.payment_status, paymentStatusLabels)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyles[order.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {statusLabel(order.status, orderStatusLabels)}
                  </span>
                  {order.child_count > 1 && (
                    <p className="mt-1 text-xs text-slate-500">{order.child_count} doanh nghiệp</p>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Link href={`/admin/orders/${order.id}`} className="whitespace-nowrap rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50">
                    Xem chi tiết
                  </Link>
                </td>
              </tr>
            ))}
            {result.orders.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-slate-500">
                  Không tìm thấy đơn hàng phù hợp với bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p>Hiển thị {firstResult}–{lastResult} trong tổng số {result.total.toLocaleString('vi-VN')} đơn hàng</p>
        <nav aria-label="Phân trang đơn hàng" className="flex items-center gap-2">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-white">Trước</Link>
          ) : (
            <span className="rounded-lg border border-slate-100 px-3 py-2 text-slate-300">Trước</span>
          )}
          <span>Trang {result.page} / {pageCount}</span>
          {result.page < pageCount ? (
            <Link href={pageHref(result.page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-white">Sau</Link>
          ) : (
            <span className="rounded-lg border border-slate-100 px-3 py-2 text-slate-300">Sau</span>
          )}
        </nav>
      </div>
    </div>
  );
}
