import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function PartnerSettlementsPage() {
  const user = await requireApprovedPartner();
  const supabase = await supabaseServer();
  const [{ data: statements }, { data: payouts }] = await Promise.all([
    supabase
      .from('settlement_statements')
      .select('*, settlement_items(*), payouts(*)')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('payouts').select('*').eq('partner_id', user.id).order('transferred_at', { ascending: false }),
  ]);

  const totalPaid = (payouts ?? []).reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Đối soát & khoản thanh toán</h1>
      <p className="mt-1 text-sm text-slate-500">Bạn chỉ xem được đối soát của doanh nghiệp mình.</p>
      <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm">
        Tổng đã nhận: <b className="text-emerald-800">{formatVnd(totalPaid)}</b>
      </div>
      <div className="mt-6 space-y-4">
        {(statements ?? []).map((s) => {
          const items = s.settlement_items ?? [];
          const paid = (s.payouts ?? []).reduce((sum: number, p: { amount: string }) => sum + Number(p.amount), 0);
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex justify-between">
                <span className="font-semibold">Kỳ {s.period_start} → {s.period_end}</span>
                <span className={s.status === 'PAID' ? 'text-emerald-700' : 'text-amber-600'}>{s.status}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-slate-600 sm:grid-cols-4">
                <p>Doanh thu: <b>{formatVnd(s.gross_amount)}</b></p>
                <p>Hoàn tiền: <b>{formatVnd(s.refund_amount)}</b></p>
                <p>Phí nền tảng: <b>{formatVnd(s.platform_fee)}</b></p>
                <p>Phải nhận: <b>{formatVnd(s.net_payable)}</b></p>
              </div>
              <p className="mt-1 text-slate-500">Đã chuyển: {formatVnd(paid)} · Còn lại: {formatVnd(Number(s.net_payable) - paid)}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-emerald-700">Chi tiết {items.length} dòng đối soát</summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-500">
                  {items.map((it: { id: string; ref_type: string; ref_id: string; amount: string; direction: string }) => (
                    <li key={it.id}>{it.direction} · {it.ref_type} {it.ref_id.slice(0, 8)} · {formatVnd(it.amount)}</li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
        {(!statements || statements.length === 0) && <p className="text-slate-500">Chưa có kỳ đối soát nào.</p>}
      </div>
    </div>
  );
}
