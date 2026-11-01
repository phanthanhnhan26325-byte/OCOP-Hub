import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { RefundForm } from '@/components/admin/RefundForm';

export const dynamic = 'force-dynamic';

export default async function AdminRefundsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [{ data: refunds, error: refundsError }, { data: paidPayments, error: paymentsError }] = await Promise.all([
    supabase.from('refunds').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('payments').select('id, amount, refunded_amount, purpose, status').in('status', ['PAID', 'PARTIALLY_REFUNDED']).order('created_at', { ascending: false }).limit(50),
  ]);
  if (refundsError) throw new Error(refundsError.message);
  if (paymentsError) throw new Error(paymentsError.message);

  return (
    <div>
      <h1 className="text-2xl font-bold">Quản lý hủy/trả & hoàn tiền</h1>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Ghi nhận hoàn tiền thủ công</h2>
        <p className="mt-1 text-sm text-slate-500">Chuyển tiền ngoài hệ thống trước, sau đó nhập mã tham chiếu ngân hàng để ghi sổ. Trang này không kết nối cổng hoàn tiền.</p>
        <RefundForm payments={paidPayments ?? []} />
      </div>
      <h2 className="mt-8 font-semibold">Lịch sử hoàn tiền</h2>
      <div className="mt-3 space-y-2">
        {(refunds ?? []).map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> · {r.ref_type} {String(r.ref_id).slice(0, 8)} ·
            <b className="ml-1">{formatVnd(r.amount)}</b> · {r.status} · {formatDate(r.created_at)}
            {r.reason && <span className="text-slate-500"> · {r.reason}</span>}
          </div>
        ))}
        {(!refunds || refunds.length === 0) && <p className="text-slate-500">Chưa có hoàn tiền nào.</p>}
      </div>
    </div>
  );
}
