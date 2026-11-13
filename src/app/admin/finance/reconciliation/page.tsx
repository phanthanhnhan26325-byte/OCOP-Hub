import Link from 'next/link';
import { SettlementActions } from '@/components/admin/SettlementActions';
import { SettlementRequestActions, type SettlementRequestRow } from '@/components/admin/SettlementRequestActions';
import { FinanceWorkspace } from '@/components/admin/FinanceWorkspace';
import { formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const pageSize = 15;

function firstParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

function relationRows<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function AdminFinanceReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[]; month?: string | string[]; page?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const query = firstParam(params.q).trim().slice(0, 100).toLocaleLowerCase('vi');
  const statusFilter = firstParam(params.status);
  const month = /^\d{4}-\d{2}$/.test(firstParam(params.month)) ? firstParam(params.month) : '';
  const requestedPage = Math.max(1, Number.parseInt(firstParam(params.page), 10) || 1);
  const supabase = await supabaseServer();
  const [{ data: statementData, error: statementError }, { data: partnerData, error: partnerError }, { data: requestData, error: requestError }] = await Promise.all([
    supabase
      .from('settlement_statements')
      .select('id, partner_id, period_start, period_end, gross_amount, refund_amount, platform_fee, adjustments, net_payable, status, created_at, partner_profiles(business_name), payouts(amount), settlement_items(ref_type, amount, direction)')
      .order('period_start', { ascending: false })
      .limit(5000),
    supabase.from('partner_profiles').select('user_id, business_name, selling_status').eq('selling_status', 'APPROVED').order('business_name'),
    supabase
      .from('settlement_requests')
      .select('id, status, requested_at, requested_amount, bank_name, account_holder, account_number, rejection_reason, proof_path, transfer_reference, settlement_statements(period_start, period_end, gross_amount, refund_amount, platform_fee, adjustments, net_payable), partner_profiles(business_name)')
      .order('requested_at', { ascending: false })
      .limit(100),
  ]);
  if (statementError) throw new Error(statementError.message);
  if (partnerError) throw new Error(partnerError.message);
  if (requestError) throw new Error(requestError.message);

  const proofPaths = (requestData ?? [])
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
  const requests: SettlementRequestRow[] = (requestData ?? []).map((request) => {
    const statementValue = request.settlement_statements;
    const statement = Array.isArray(statementValue) ? statementValue[0] : statementValue;
    const profileValue = request.partner_profiles;
    const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue;
    const { proof_path: proofPath, ...rest } = request;
    return {
      ...rest,
      statement: statement ?? null,
      business_name: profile?.business_name ?? 'Doanh nghiệp',
      proof_url: proofPath ? proofUrls.get(proofPath) ?? null : null,
    } as SettlementRequestRow;
  });
  const statements = (statementData ?? []) as unknown as {
    id: string;
    partner_id: string;
    period_start: string;
    period_end: string;
    gross_amount: number | string;
    refund_amount: number | string;
    platform_fee: number | string;
    adjustments: number | string;
    net_payable: number | string;
    status: string;
    created_at: string;
    partner_profiles: { business_name: string } | { business_name: string }[] | null;
    payouts: { amount: number | string }[] | null;
    settlement_items: { ref_type: string; amount: number | string; direction: string }[] | null;
  }[];
  const filtered = statements.filter((statement) => {
    const business = relationRows(statement.partner_profiles)[0]?.business_name ?? '';
    return (!query || business.toLocaleLowerCase('vi').includes(query))
      && (!statusFilter || statement.status === statusFilter)
      && (!month || statement.period_start.startsWith(month));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <FinanceWorkspace
      active="/admin/finance/reconciliation"
      title="Đối soát doanh nghiệp"
      description="Tổng hợp doanh thu đủ điều kiện, phí nền tảng, hoàn tiền, điều chỉnh và recover theo từng tháng."
    >
      <section className="rounded-xl border border-emerald-200 bg-white p-5">
        <h2 className="font-semibold">Yêu cầu đối soát từ doanh nghiệp</h2>
        <p className="mt-1 text-sm text-slate-500">Duyệt hoặc từ chối yêu cầu. Sau khi chuyển khoản thủ công, nhập mã giao dịch và tải chứng từ để ghi nhận đã đối soát.</p>
        <SettlementRequestActions requests={requests} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Tạo kỳ đối soát theo tháng</h2>
        <p className="mt-1 text-sm text-slate-500">Chỉ tạo kỳ tháng dương lịch đầy đủ. Kỳ đã tồn tại giữ nguyên snapshot; không bị ghi đè khi tạo lại.</p>
        <SettlementActions partners={(partnerData ?? []).map((partner) => ({ user_id: partner.user_id, business_name: partner.business_name }))} />
      </section>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-medium text-slate-600">Tìm doanh nghiệp
          <input name="q" defaultValue={firstParam(params.q)} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Tên doanh nghiệp" />
        </label>
        <label className="text-xs font-medium text-slate-600">Tháng
          <input type="month" name="month" defaultValue={month} className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-600">Trạng thái
          <select name="status" defaultValue={statusFilter} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            <option value="DRAFT">Nháp</option>
            <option value="CONFIRMED">Đã xác nhận</option>
            <option value="PAID">Đã chi trả</option>
          </select>
        </label>
        <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Lọc kỳ đối soát</button>
        <Link href="/admin/finance/reconciliation" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">Xóa lọc</Link>
      </form>

      <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Các kỳ đối soát</h2>
          <p className="mt-1 text-xs text-slate-500">{filtered.length} kỳ · Trang {currentPage}/{pageCount}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-3">Mã kỳ</th>
                <th className="px-3 py-3">Doanh nghiệp</th>
                <th className="px-3 py-3">Kỳ</th>
                <th className="px-3 py-3">GMV đủ điều kiện</th>
                <th className="px-3 py-3">Hoa hồng</th>
                <th className="px-3 py-3">Điều chỉnh</th>
                <th className="px-3 py-3">Recover</th>
                <th className="px-3 py-3">Phải trả</th>
                <th className="px-3 py-3">Đã trả</th>
                <th className="px-3 py-3">Còn lại</th>
                <th className="px-3 py-3">Trạng thái</th>
                <th className="px-3 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((statement) => {
                const payouts = relationRows(statement.payouts);
                const paid = payouts.reduce((sum, payout) => sum + Number(payout.amount), 0);
                const recoveries = (statement.settlement_items ?? [])
                  .filter((item) => item.ref_type === 'RECOVERY')
                  .reduce((sum, item) => sum + Number(item.amount), 0);
                const adjustments = Number(statement.adjustments) + recoveries;
                return (
                  <tr key={statement.id}>
                    <td className="px-3 py-3 font-mono text-xs">{statement.id.slice(0, 8)}</td>
                    <td className="px-3 py-3 font-medium">{relationRows(statement.partner_profiles)[0]?.business_name ?? 'Doanh nghiệp'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{statement.period_start.slice(0, 7)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatVnd(statement.gross_amount)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatVnd(statement.platform_fee)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatVnd(adjustments)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatVnd(recoveries)}</td>
                    <td className="px-3 py-3 whitespace-nowrap font-medium">{formatVnd(statement.net_payable)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatVnd(paid)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatVnd(Math.max(Number(statement.net_payable) - paid, 0))}</td>
                    <td className="px-3 py-3"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700">{statement.status}</span></td>
                    <td className="px-3 py-3"><Link href={`/admin/finance/reconciliation/${statement.id}`} className="font-medium text-emerald-800 hover:underline">Xem chi tiết</Link></td>
                  </tr>
                );
              })}
              {visible.length === 0 && <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-500">Chưa có kỳ đối soát phù hợp.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-3">
          <Link aria-disabled={currentPage <= 1} href={`?${new URLSearchParams({ q: firstParam(params.q), status: statusFilter, month, page: String(Math.max(1, currentPage - 1)) })}`} className={`rounded border px-3 py-1.5 text-xs ${currentPage <= 1 ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200'}`}>Trước</Link>
          <Link aria-disabled={currentPage >= pageCount} href={`?${new URLSearchParams({ q: firstParam(params.q), status: statusFilter, month, page: String(Math.min(pageCount, currentPage + 1)) })}`} className={`rounded border px-3 py-1.5 text-xs ${currentPage >= pageCount ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200'}`}>Sau</Link>
        </div>
      </section>
    </FinanceWorkspace>
  );
}
