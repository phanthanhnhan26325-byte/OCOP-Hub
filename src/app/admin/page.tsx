import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [{ count: products }, { count: workshops }, { count: applications }, { data: orders }, { data: payments }] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('workshops').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('partner_applications').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from('orders').select('id, total, status').eq('order_level', 'PARENT'),
    supabase.from('payments').select('id, amount, status, business_sync_status'),
  ]);

  const paidTotal = (payments ?? []).filter((p) => p.status === 'PAID').reduce((s, p) => s + Number(p.amount), 0);
  const syncIssues = (payments ?? []).filter((p) => p.business_sync_status === 'PENDING_SYNC').length;

  return (
    <div>
      <h1 className="text-2xl font-bold">Tổng quan hệ thống</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Sản phẩm chờ duyệt', products ?? 0],
          ['Workshop chờ duyệt', workshops ?? 0],
          ['Hồ sơ DN chờ duyệt', applications ?? 0],
          ['Tổng đơn hàng', orders?.length ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Tổng tiền đã thanh toán qua nền tảng</p>
          <p className="text-2xl font-bold text-emerald-700">{formatVnd(paidTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Payment cần sync lại (PENDING_SYNC)</p>
          <p className={`text-2xl font-bold ${syncIssues > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{syncIssues}</p>
        </div>
      </div>
    </div>
  );
}
