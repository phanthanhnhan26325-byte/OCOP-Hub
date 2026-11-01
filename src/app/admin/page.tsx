import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const admin = await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [{ data: metrics, error: metricsError }, { data: orders, error: ordersError }, { data: applications, error: applicationsError }, { data: payments, error: paymentsError }] = await Promise.all([
    supabaseAdmin().rpc('admin_dashboard_overview', { p_admin: admin.id }),
    supabase.from('orders').select('id, code, total, status, placed_at, users!orders_customer_id_fkey(full_name, email)').eq('order_level', 'PARENT').order('placed_at', { ascending: false }).limit(8),
    supabase.from('partner_applications').select('id, created_at, partner_profiles(business_name)').eq('status', 'PENDING').order('created_at', { ascending: true }).limit(6),
    supabase.from('payments').select('id, amount, purpose, status, created_at').in('status', ['CREATED', 'PENDING']).order('created_at', { ascending: true }).limit(6),
  ]);
  if (metricsError) throw new Error(metricsError.message);
  if (ordersError) throw new Error(ordersError.message);
  if (applicationsError) throw new Error(applicationsError.message);
  if (paymentsError) throw new Error(paymentsError.message);
  const values = metrics as {
    customers: number; partners: number; pendingPartners: number; products: number; activeProducts: number;
    workshops: number; upcomingWorkshops: number; orders: number; processingOrders: number;
    pendingPayments: number; confirmedRevenue: number; refundedAmount: number; payoutDue: number;
  };
  const cards = [
    ['Khách hàng', values.customers, '/admin/users'],
    ['Doanh nghiệp', values.partners, '/admin/partner-applications'],
    ['Hồ sơ chờ duyệt', values.pendingPartners, '/admin/partner-applications'],
    ['Sản phẩm / đang bán', `${values.products} / ${values.activeProducts}`, '/admin/products'],
    ['Workshop / sắp diễn ra', `${values.workshops} / ${values.upcomingWorkshops}`, '/admin/workshops'],
    ['Đơn hàng tổng', values.orders, '/admin/orders'],
    ['Đơn đang xử lý', values.processingOrders, '/admin/orders'],
    ['Giao dịch chờ xác nhận', values.pendingPayments, '/admin/payments'],
  ] as const;

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard quản trị</h1>
      <p className="mt-1 text-sm text-slate-500">Số liệu tổng hợp từ giao dịch và trạng thái đang có trong hệ thống.</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link href={href} key={label} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Thanh toán đã đồng bộ (gộp Parent Order một lần)</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{formatVnd(values.confirmedRevenue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Đã hoàn</p>
          <p className="mt-1 text-xl font-bold">{formatVnd(values.refundedAmount)}</p>
        </div>
        <Link href="/admin/settlements" className="rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-300">
          <p className="text-sm text-slate-500">Đối tác còn chờ chi trả</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{formatVnd(values.payoutDue)}</p>
        </Link>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Đơn hàng mới</h2>
            <Link href="/admin/orders" className="text-sm text-emerald-700 hover:underline">Tất cả đơn</Link>
          </div>
          <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {(orders ?? []).map((order) => {
              const customer = order.users as unknown as { full_name: string; email: string } | null;
              return (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                  <div><p className="font-medium">{order.code}</p><p className="text-xs text-slate-500">{customer?.full_name || customer?.email || 'Khách hàng'}</p></div>
                  <div className="text-right"><p className="font-semibold">{formatVnd(order.total)}</p><p className="text-xs text-slate-500">{order.status}</p></div>
                </div>
              );
            })}
            {(!orders || orders.length === 0) && <p className="p-5 text-sm text-slate-500">Chưa có đơn hàng.</p>}
          </div>
        </section>
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Hồ sơ doanh nghiệp chờ duyệt</h2>
            <Link href="/admin/partner-applications" className="text-sm text-emerald-700 hover:underline">Xem hồ sơ</Link>
          </div>
          <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {(applications ?? []).map((application) => {
              const partner = application.partner_profiles as unknown as { business_name: string } | null;
              return <div key={application.id} className="p-4 text-sm"><p className="font-medium">{partner?.business_name ?? 'Doanh nghiệp'}</p><p className="text-xs text-slate-500">{new Date(application.created_at).toLocaleDateString('vi-VN')}</p></div>;
            })}
            {(!applications || applications.length === 0) && <p className="p-5 text-sm text-slate-500">Không có hồ sơ chờ duyệt.</p>}
          </div>
        </section>
        <section className="xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Thanh toán chờ xử lý</h2>
            <Link href="/admin/payments" className="text-sm text-emerald-700 hover:underline">Tất cả giao dịch</Link>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-100 text-slate-500"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Loại</th><th className="px-4 py-3">Số tiền</th><th className="px-4 py-3">Trạng thái</th></tr></thead>
              <tbody>
                {(payments ?? []).map((payment) => <tr key={payment.id} className="border-b border-slate-50"><td className="px-4 py-2 font-mono text-xs">{payment.id.slice(0, 8)}</td><td className="px-4 py-2">{payment.purpose === 'ORDER' ? 'Đơn hàng' : 'Workshop'}</td><td className="px-4 py-2">{formatVnd(payment.amount)}</td><td className="px-4 py-2 text-amber-700">{payment.status}</td></tr>)}
                {(!payments || payments.length === 0) && <tr><td colSpan={4} className="px-4 py-5 text-center text-slate-500">Không có giao dịch chờ xử lý.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
