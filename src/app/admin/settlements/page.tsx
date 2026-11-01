import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { SettlementActions } from '@/components/admin/SettlementActions';

export const dynamic = 'force-dynamic';

interface SettlementItem {
  id: string;
  ref_type: string;
  ref_id: string;
  direction: string;
  amount: number | string;
}

export default async function AdminSettlementsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [{ data: statements, error: statementsError }, { data: partners, error: partnersError }] = await Promise.all([
    supabase
      .from('settlement_statements')
      .select('*, partner_profiles(business_name), payouts(*), settlement_items(*)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('partner_profiles').select('user_id, business_name, selling_status').eq('selling_status', 'APPROVED'),
  ]);
  if (statementsError) throw new Error(statementsError.message);
  if (partnersError) throw new Error(partnersError.message);

  return (
    <div>
      <h1 className="text-2xl font-bold">Quản lý đối soát</h1>
      <p className="mt-1 text-sm text-slate-500">Không có kết nối ngân hàng: chỉ ghi nhận payout sau khi đã chuyển tiền và có mã tham chiếu thực tế.</p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Tạo kỳ đối soát cho doanh nghiệp</h2>
        <SettlementActions partners={partners ?? []} />
      </div>
      <div className="mt-8 space-y-4">
        {(statements ?? []).map((s) => {
          const paid = (s.payouts ?? []).reduce((sum: number, p: { amount: string }) => sum + Number(p.amount), 0);
          const items = (s.settlement_items ?? []) as unknown as SettlementItem[];
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
              {items.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-emerald-800">Chi tiết {items.length} khoản đối soát</summary>
                  <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100 px-3">
                    {items.map((item) => (
                      <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs">
                        <span>{item.ref_type} · {String(item.ref_id).slice(0, 8)} · {item.direction === 'DEBIT' ? 'Khấu trừ' : 'Ghi có'}</span>
                        <b className={item.direction === 'DEBIT' ? 'text-red-600' : 'text-emerald-700'}>{item.direction === 'DEBIT' ? '−' : '+'}{formatVnd(item.amount)}</b>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <SettlementActions statementId={s.id} net={Number(s.net_payable) - paid} status={s.status} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
