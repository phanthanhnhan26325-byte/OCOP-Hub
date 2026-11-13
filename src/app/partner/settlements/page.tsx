import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatVnd } from '@/lib/money';
import { SettlementRequestForm } from '@/components/partner/SettlementRequestForm';

export const dynamic = 'force-dynamic';

export default async function PartnerSettlementsPage() {
  const user = await requireApprovedPartner();
  const supabase = await supabaseServer();
  const [{ data: statements, error: statementsError }, { data: payouts, error: payoutsError }, { data: account, error: accountError }, { data: requests, error: requestsError }] = await Promise.all([
    supabase
      .from('settlement_statements')
      .select('*, settlement_items(*), payouts(*)')
      .eq('partner_id', user.id)
      .order('created_at', { ascending: false }),
    supabase.from('payouts').select('*').eq('partner_id', user.id).order('transferred_at', { ascending: false }),
    supabase.from('partner_payout_accounts').select('bank_name, account_holder, account_number').eq('partner_id', user.id).maybeSingle(),
    supabase.from('settlement_requests')
      .select('*, settlement_statements(period_start, period_end, gross_amount, refund_amount, platform_fee, net_payable)')
      .eq('partner_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(100),
  ]);
  for (const error of [statementsError, payoutsError, accountError, requestsError]) {
    if (error) throw new Error(error.message);
  }

  const totalPaid = (payouts ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const proofPaths = (requests ?? [])
    .map((request) => request.proof_path as string | null)
    .filter((path): path is string => Boolean(path));
  const proofUrls = new Map<string, string>();
  if (proofPaths.length > 0) {
    const { data, error } = await supabaseAdmin()
      .storage.from('ocop-settlement-payout-proofs-v1').createSignedUrls(proofPaths, 300);
    if (error) throw new Error(error.message);
    for (const proof of data) {
      if (proof.error) throw new Error(proof.error);
      if (proof.path && proof.signedUrl) proofUrls.set(proof.path, proof.signedUrl);
    }
  }
  const requestRows = (requests ?? []).map((request) => ({
    ...request,
    proofUrl: request.proof_path ? proofUrls.get(request.proof_path) ?? null : null,
  }));
  const statusLabels: Record<string, string> = {
    REQUESTED: 'Chờ admin duyệt',
    APPROVED: 'Đã duyệt · chờ chuyển khoản',
    REJECTED: 'Bị từ chối',
    PAID: 'Đã đối soát',
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Đối soát & khoản thanh toán</h1>
      <p className="mt-1 text-sm text-slate-500">Tạo yêu cầu cho kỳ đã kết thúc. Admin duyệt, chuyển khoản thủ công và tải chứng từ trước khi hệ thống ghi nhận đã thanh toán.</p>
      <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm">
        Tổng đã nhận: <b className="text-emerald-800">{formatVnd(totalPaid)}</b>
      </div>
      <SettlementRequestForm account={account} />
      <section className="mt-6">
        <h2 className="font-semibold">Yêu cầu đối soát đã gửi</h2>
        <div className="mt-3 space-y-3">
          {requestRows.map((request) => {
            const statement = Array.isArray(request.settlement_statements) ? request.settlement_statements[0] : request.settlement_statements;
            return (
              <article key={request.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Kỳ {statement?.period_start} → {statement?.period_end}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${request.status === 'REJECTED' ? 'bg-red-50 text-red-700' : request.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {statusLabels[request.status] ?? request.status}
                  </span>
                </div>
                <div className="mt-2 grid gap-1 text-slate-600 sm:grid-cols-2">
                  <p>Doanh thu đủ điều kiện: <b>{formatVnd(statement?.gross_amount ?? 0)}</b></p>
                  <p>Phí sàn đã ghi nhận: <b>{formatVnd(statement?.platform_fee ?? 0)}</b></p>
                  <p>Hoàn tiền: <b>{formatVnd(statement?.refund_amount ?? 0)}</b></p>
                  <p>Số tiền yêu cầu nhận: <b className="text-slate-900">{formatVnd(request.requested_amount)}</b></p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Tài khoản nhận: {request.bank_name} · {request.account_holder} · {request.account_number}
                </p>
                {request.rejection_reason && <p className="mt-2 text-sm text-red-700">Lý do từ chối: {request.rejection_reason}</p>}
                {request.transfer_reference && <p className="mt-2 text-xs text-slate-600">Mã giao dịch: {request.transfer_reference}{request.paid_at ? ` · Đã chuyển lúc ${new Date(request.paid_at).toLocaleString('vi-VN')}` : ''}</p>}
                {request.proofUrl && (
                  <a href={request.proofUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-emerald-800 underline">
                    Xem chứng từ chuyển khoản
                  </a>
                )}
              </article>
            );
          })}
          {requestRows.length === 0 && <p className="text-sm text-slate-500">Chưa gửi yêu cầu đối soát.</p>}
        </div>
      </section>
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
