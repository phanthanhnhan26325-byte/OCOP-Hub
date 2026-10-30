import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { SettlementActions } from '@/components/admin/SettlementActions';

export const dynamic = 'force-dynamic';

export default async function AdminSettlementsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [{ data: statements }, { data: partners }] = await Promise.all([
    supabase
      .from('settlement_statements')
      .select('*, partner_profiles(business_name), payouts(*)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('partner_profiles').select('user_id, business_name, selling_status').eq('selling_status', 'APPROVED'),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Quản lý đối soát</h1>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Tạo kỳ đối soát cho doanh nghiệp</h2>
        <SettlementActions partners={partners ?? []} />
      </div>
      <div className="mt-8 space-y-4">
        {(statements ?? []).map((s) => {
          const paid = (s.payouts ?? []).reduce((sum: number, p: { amount: string }) => sum + Number(p.amount), 0);
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold">{(s.partner_profiles as { business_name: string } | null)?.business_name}</span>
                <span className={s.status === 'PAID' ? 'text-emerald-700' : 'text-amber-600'}>{s.status}</span>
              </div>
              <p className="text-slate-500">Kỳ {s.period_start} → {s.period_end}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <p>Doanh thu: <b>{formatVnd(s.gross_amount)}</b></p>
                <p>Hoàn: <b>{formatVnd(s.refund_amount)}</b></p>
                <p>Phí NN: <b>{formatVnd(s.platform_fee)}</b></p>
                <p>Phải trả: <b>{formatVnd(s.net_payable)}</b></p>
              </div>
              <p className="mt-1 text-slate-500">Đã chuyển: {formatVnd(paid)}</p>
              <SettlementActions statementId={s.id} net={Number(s.net_payable) - paid} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
