import Link from 'next/link';
import { FinanceWorkspace } from '@/components/admin/FinanceWorkspace';
import { formatDate, formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const pageSize = 20;

function firstParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export default async function AdminFinancePayouts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const query = firstParam(params.q).trim().toLocaleLowerCase('vi');
  const requestedPage = Math.max(1, Number.parseInt(firstParam(params.page), 10) || 1);
  const supabase = await supabaseServer();
  const { data: payoutData, error: payoutError } = await supabase
    .from('payouts')
    .select('id, statement_id, partner_id, amount, method, ref_no, transferred_at, recorded_by, settlement_statements(id, period_start, period_end, status, partner_profiles(business_name))')
    .order('transferred_at', { ascending: false })
    .limit(5000);
  if (payoutError) throw new Error(payoutError.message);
  const payoutsWithActor = (payoutData ?? []) as unknown as { recorded_by: string | null }[];
  const actorIds = [...new Set(payoutsWithActor.map((payout) => payout.recorded_by).filter((id): id is string => Boolean(id)))];
  const { data: actorData, error: actorError } = actorIds.length > 0
    ? await supabase.from('users').select('id, full_name').in('id', actorIds)
    : { data: [], error: null };
  if (actorError) throw new Error(actorError.message);
  const actorNames = new Map(((actorData ?? []) as unknown as { id: string; full_name: string | null }[]).map((actor) => [actor.id, actor.full_name]));

  const payouts = (payoutData ?? []) as unknown as {
    id: string;
    statement_id: string;
    partner_id: string;
    amount: number | string;
    method: string;
    ref_no: string;
    transferred_at: string;
    recorded_by: string | null;
    settlement_statements: {
      id: string;
      period_start: string;
      period_end: string;
      status: string;
      partner_profiles: { business_name: string } | { business_name: string }[] | null;
    } | {
      id: string;
      period_start: string;
      period_end: string;
      status: string;
      partner_profiles: { business_name: string } | { business_name: string }[] | null;
    }[] | null;
  }[];
  const filtered = payouts.filter((payout) => {
    const settlement = firstRelation(payout.settlement_statements);
    const partner = firstRelation(settlement?.partner_profiles);
    return !query || [
      payout.ref_no,
      partner?.business_name ?? '',
      settlement?.period_start ?? '',
      payout.method,
    ].some((value) => value.toLocaleLowerCase('vi').includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPaid = filtered.reduce((sum, payout) => sum + Number(payout.amount), 0);

  return (
    <FinanceWorkspace
      active="/admin/finance/payouts"
      title="Quản lý chi trả"
      description="Tra cứu các khoản đã chuyển cho doanh nghiệp. Chỉ ghi nhận payout sau khi chuyển tiền thực tế và có mã tham chiếu."
    >
      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Tổng payout đã ghi nhận</p>
          <p className="mt-2 text-xl font-bold">{formatVnd(totalPaid)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Số giao dịch</p>
          <p className="mt-2 text-xl font-bold">{filtered.length.toLocaleString('vi-VN')}</p>
        </article>
        <article className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">Thao tác ghi nhận chi trả</p>
          <Link href="/admin/finance/reconciliation" className="mt-2 inline-block text-sm font-semibold text-emerald-800 hover:underline">Mở kỳ đối soát để chi trả →</Link>
        </article>
      </section>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-xs font-medium text-slate-600">Tìm mã chi trả, doanh nghiệp, kỳ hoặc phương thức
          <input name="q" defaultValue={firstParam(params.q)} className="mt-1 block w-full min-w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </label>
        <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Tìm kiếm</button>
        <span className="text-xs text-slate-500">{filtered.length} kết quả · Trang {currentPage}/{pageCount}</span>
      </form>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1150px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-3">Mã chi trả</th><th className="px-4 py-3">Doanh nghiệp</th><th className="px-4 py-3">Kỳ đối soát</th><th className="px-4 py-3">Số tiền</th><th className="px-4 py-3">Ngày chi</th><th className="px-4 py-3">Phương thức</th><th className="px-4 py-3">Mã tham chiếu</th><th className="px-4 py-3">Người thực hiện</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Nguồn</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((payout) => {
                const statement = firstRelation(payout.settlement_statements);
                const partner = firstRelation(statement?.partner_profiles);
                return (
                  <tr key={payout.id}>
                    <td className="px-4 py-3 font-mono text-xs">{payout.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium">{partner?.business_name ?? 'Doanh nghiệp'}</td>
                    <td className="px-4 py-3">{statement?.period_start.slice(0, 7) ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold">{formatVnd(payout.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(payout.transferred_at)}</td>
                    <td className="px-4 py-3">{payout.method}</td>
                    <td className="px-4 py-3 font-mono text-xs">{payout.ref_no}</td>
                    <td className="px-4 py-3">{payout.recorded_by ? actorNames.get(payout.recorded_by) || 'Admin' : '—'}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">Đã ghi nhận</span></td>
                    <td className="px-4 py-3"><Link href={`/admin/finance/reconciliation/${payout.statement_id}`} className="font-medium text-emerald-800 hover:underline">Kỳ đối soát</Link></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={10} className="px-4 py-9 text-center text-slate-500">Chưa có khoản chi trả phù hợp. Không có payout giả; hãy ghi nhận từ kỳ đối soát sau khi chuyển tiền thực tế.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-3">
          <Link href={`?${new URLSearchParams({ q: firstParam(params.q), page: String(Math.max(1, currentPage - 1)) })}`} className={`rounded border px-3 py-1.5 text-xs ${currentPage <= 1 ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200'}`}>Trước</Link>
          <Link href={`?${new URLSearchParams({ q: firstParam(params.q), page: String(Math.min(pageCount, currentPage + 1)) })}`} className={`rounded border px-3 py-1.5 text-xs ${currentPage >= pageCount ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200'}`}>Sau</Link>
        </div>
      </section>
    </FinanceWorkspace>
  );
}
