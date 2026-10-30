import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { SyncPaymentsButton } from '@/components/admin/SyncPaymentsButton';

export const dynamic = 'force-dynamic';

export default async function AdminPaymentsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: payments } = await supabase
    .from('payments')
    .select('id, purpose, amount, status, provider, business_sync_status, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Giám sát thanh toán</h1>
        <SyncPaymentsButton />
      </div>
      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3">Mã</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">Số tiền</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Sync</th>
              <th className="px-4 py-3">Thời điểm</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-mono text-xs">{p.id.slice(0, 8)}</td>
                <td className="px-4 py-2">{p.purpose === 'ORDER' ? 'Đơn hàng' : 'Workshop'}</td>
                <td className="px-4 py-2">{formatVnd(p.amount)}</td>
                <td className={`px-4 py-2 ${p.status === 'PAID' ? 'text-emerald-700' : p.status === 'FAILED' || p.status === 'EXPIRED' ? 'text-red-600' : 'text-amber-600'}`}>{p.status}</td>
                <td className={`px-4 py-2 ${p.business_sync_status === 'PENDING_SYNC' ? 'font-semibold text-red-600' : 'text-slate-500'}`}>{p.business_sync_status}</td>
                <td className="px-4 py-2 text-slate-500">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
