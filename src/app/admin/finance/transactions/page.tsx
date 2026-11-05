import Link from 'next/link';
import { FinanceDateFilters, FinanceWorkspace } from '@/components/admin/FinanceWorkspace';
import { FinanceTransactionTable } from '@/components/admin/FinanceTables';
import { financeDateRange, loadFinanceSnapshot } from '@/lib/admin-finance';
import { loadFinanceTransactions } from '@/lib/admin-finance-transactions';
import { formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const pageSize = 20;

function firstParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function AdminFinanceTransactions({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
    q?: string | string[];
    type?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const range = financeDateRange(firstParam(params.range), firstParam(params.from), firstParam(params.to));
  const search = firstParam(params.q).trim().toLocaleLowerCase('vi');
  const type = firstParam(params.type);
  const status = firstParam(params.status);
  const requestedPage = Math.max(1, Number.parseInt(firstParam(params.page), 10) || 1);
  const supabase = await supabaseServer();
  const snapshot = await loadFinanceSnapshot(supabase, range);
  const allTransactions = await loadFinanceTransactions(
    supabase,
    range,
    snapshot.orders,
    snapshot.expenses,
    snapshot.payouts,
    snapshot.recoveries,
    5000,
  );
  const filtered = allTransactions.filter((row) =>
    (!type || row.type === type)
    && (!status || row.status === status)
    && (!search || [row.code, row.related, row.description, row.orderCode, row.partnerName, row.status]
      .some((value) => value.toLocaleLowerCase('vi').includes(search))),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const transactionTypes = [...new Set(allTransactions.map((row) => row.type))].sort((a, b) => a.localeCompare(b, 'vi'));
  const statuses = [...new Set(allTransactions.map((row) => row.status))].sort((a, b) => a.localeCompare(b, 'vi'));

  const filterParams = new URLSearchParams();
  filterParams.set('range', range.range);
  if (range.range === 'custom') {
    filterParams.set('from', range.from);
    filterParams.set('to', range.to);
  }
  if (search) filterParams.set('q', firstParam(params.q));
  if (type) filterParams.set('type', type);
  if (status) filterParams.set('status', status);
  const paginationHref = (page: number) => {
    const query = new URLSearchParams(filterParams);
    query.set('page', String(page));
    return `/admin/finance/transactions?${query.toString()}`;
  };

  return (
    <FinanceWorkspace
      active="/admin/finance/transactions"
      title="Lịch sử giao dịch"
      description="Tổng hợp thanh toán, hoa hồng, chi trả, vận chuyển, hoàn tiền, điều chỉnh và các khoản cần recover; mỗi dòng có nguồn dữ liệu."
    >
      <FinanceDateFilters range={range.range} from={range.from} to={range.to} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">Tiền thu đã ghi nhận</p>
          <p className="mt-1 text-xl font-bold text-emerald-900">{formatVnd(filtered.filter((row) => row.direction === 'IN' && ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'Đã ghi nhận'].includes(row.status)).reduce((sum, row) => sum + row.amount, 0))}</p>
        </article>
        <article className="rounded-xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-sm text-rose-800">Tiền chi đã ghi nhận</p>
          <p className="mt-1 text-xl font-bold text-rose-900">{formatVnd(filtered.filter((row) => row.direction === 'OUT' && ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'Đã ghi nhận'].includes(row.status)).reduce((sum, row) => sum + row.amount, 0))}</p>
        </article>
        <article className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">Khoản đang thu hồi / chờ xử lý</p>
          <p className="mt-1 text-xl font-bold text-amber-900">{formatVnd(filtered.filter((row) => row.direction === 'RECOVERY').reduce((sum, row) => sum + row.amount, 0))}</p>
        </article>
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <input type="hidden" name="range" value={range.range} />
        {range.range === 'custom' && <>
          <input type="hidden" name="from" value={range.from} />
          <input type="hidden" name="to" value={range.to} />
        </>}
        <label className="text-xs font-medium text-slate-600">Loại giao dịch
          <select name="type" defaultValue={type} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            {transactionTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Trạng thái
          <select name="status" defaultValue={status} className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Tất cả</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">Mã giao dịch, đơn hàng hoặc doanh nghiệp
          <input name="q" defaultValue={firstParam(params.q)} className="mt-1 block min-w-72 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Nhập mã đơn hoặc doanh nghiệp" />
        </label>
        <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Lọc giao dịch</button>
        <span className="text-xs text-slate-500">{filtered.length} kết quả</span>
      </form>

      <div className="mt-4">
        <FinanceTransactionTable transactions={visible} showFilters={false} pageSize={pageSize} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>Trang {currentPage}/{pageCount}</span>
        <div className="flex gap-2">
          <Link href={paginationHref(Math.max(1, currentPage - 1))} className={`rounded border px-3 py-1.5 ${currentPage <= 1 ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200'}`}>Trước</Link>
          <Link href={paginationHref(Math.min(pageCount, currentPage + 1))} className={`rounded border px-3 py-1.5 ${currentPage >= pageCount ? 'pointer-events-none border-slate-100 text-slate-300' : 'border-slate-200'}`}>Sau</Link>
        </div>
      </div>
    </FinanceWorkspace>
  );
}
