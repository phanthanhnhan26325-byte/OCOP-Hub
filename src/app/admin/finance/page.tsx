import { FinanceWorkspace, FinanceDateFilters, FinanceCard } from '@/components/admin/FinanceWorkspace';
import { FinanceComposition, FinanceTrendChart, type FinanceChartPoint } from '@/components/admin/FinanceVisualizations';
import { FinancePartnerTable, FinanceTransactionTable, type FinancePartnerRow } from '@/components/admin/FinanceTables';
import { loadFinanceSnapshot, financeDateRange, financeBucketDates, financeGroupKey, financeTrend, groupFinanceOrders, previousFinanceRange } from '@/lib/admin-finance';
import { loadFinanceTransactions } from '@/lib/admin-finance-transactions';
import { formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

function totals(snapshot: Awaited<ReturnType<typeof loadFinanceSnapshot>>) {
  const gmv = snapshot.orders.reduce((sum, order) => sum + Number(order.subtotal), 0);
  const commission = snapshot.orders.reduce((sum, order) => sum + order.commission, 0);
  const shipping = snapshot.expenses
    .filter((expense) => expense.expense_type === 'SHIPPING')
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const operating = snapshot.expenses
    .filter((expense) => expense.expense_type === 'OPERATING')
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  const payable = snapshot.statements.reduce(
    (sum, statement) => sum + Math.max(Number(statement.net_payable) - (snapshot.paidByStatement[statement.id] ?? 0), 0),
    0,
  );
  const paid = snapshot.payouts.reduce((sum, payout) => sum + Number(payout.amount), 0);
  return { gmv, commission, shipping, operating, profit: commission - shipping - operating, payable, paid };
}

const statementLabels: Record<string, string> = {
  DRAFT: 'Nháp',
  CONFIRMED: 'Đã xác nhận',
  PAID: 'Đã chi trả',
};

export default async function AdminFinanceDashboard({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
    group?: string | string[];
  }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const range = financeDateRange(
    firstParam(params.range),
    firstParam(params.from),
    firstParam(params.to),
  );
  const previous = previousFinanceRange(range);
  const allowedGroups = ['day', 'week', 'month', 'quarter', 'year'];
  const requestedGroup = firstParam(params.group);
  const grouping = allowedGroups.includes(requestedGroup)
    ? requestedGroup
    : (new Date(`${range.to}T00:00:00.000Z`).getTime() - new Date(`${range.from}T00:00:00.000Z`).getTime()) / 86_400_000 < 46
      ? 'day'
      : 'month';
  const supabase = await supabaseServer();
  const [snapshot, previousSnapshot] = await Promise.all([
    loadFinanceSnapshot(supabase, range),
    loadFinanceSnapshot(supabase, previous),
  ]);
  const currentTotals = totals(snapshot);
  const previousTotals = totals(previousSnapshot);
  const transactions = await loadFinanceTransactions(
    supabase,
    range,
    snapshot.orders,
    snapshot.expenses,
    snapshot.payouts,
    snapshot.recoveries,
    10,
  );

  const pointsByKey = new Map<string, FinanceChartPoint>();
  for (const key of financeBucketDates(range, grouping)) {
    pointsByKey.set(key, { label: key, gmv: 0, commission: 0, shipping: 0, operating: 0, profit: 0 });
  }
  for (const order of snapshot.orders) {
    const key = financeGroupKey(order.placed_at, grouping);
    const point = pointsByKey.get(key);
    if (point) {
      point.gmv += Number(order.subtotal);
      point.commission += order.commission;
      point.profit += order.commission;
    }
  }
  for (const expense of snapshot.expenses) {
    const key = financeGroupKey(expense.incurred_at.slice(0, 10), grouping);
    const point = pointsByKey.get(key);
    if (point) {
      if (expense.expense_type === 'SHIPPING') point.shipping += Number(expense.amount);
      else point.operating += Number(expense.amount);
      point.profit -= Number(expense.amount);
    }
  }

  const groups = groupFinanceOrders(snapshot.orders);
  const partners: FinancePartnerRow[] = groups.map((group) => {
    const statement = snapshot.statements.find((item) => item.partner_id === group.partnerId);
    const payable = statement
      ? Math.max(Number(statement.net_payable) - (snapshot.paidByStatement[statement.id] ?? 0), 0)
      : Math.max(group.gmv - group.refunds - group.commission, 0);
    return {
      ...group,
      payable,
      status: statement ? statementLabels[statement.status] ?? statement.status : 'Chưa đối soát',
      statementId: statement?.id ?? null,
    };
  });

  return (
    <FinanceWorkspace
      active="/admin/finance"
      title="Tổng quan tài chính"
      description="Theo dõi GMV, doanh thu hoa hồng, chi phí thực tế, lợi nhuận ước tính và công nợ đối tác."
    >
      <FinanceDateFilters
        range={range.range}
        from={range.from}
        to={range.to}
        grouping={grouping}
      />
      <p className="mt-3 text-xs text-slate-500">
        Kỳ báo cáo: {range.from} — {range.to}. GMV và hoa hồng chỉ tính đơn đã giao/hoàn thành, thanh toán đã đồng bộ; chi phí chỉ gồm khoản thực tế được ghi nhận.
      </p>

      <section aria-label="Chỉ số tài chính" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FinanceCard title="Tổng giá trị hàng hóa (GMV)" value={formatVnd(currentTotals.gmv)} caption="Giá trị hàng hóa đủ điều kiện; không phải doanh thu OCOP Hub." accent="emerald" trend={{ value: financeTrend(currentTotals.gmv, previousTotals.gmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Doanh thu hoa hồng" value={formatVnd(currentTotals.commission)} caption="Theo phí nền tảng đã chụp trên đơn, giảm tương ứng phần hàng đã hoàn." accent="rose" trend={{ value: financeTrend(currentTotals.commission, previousTotals.commission), label: 'so với kỳ trước' }} />
        <FinanceCard title="Lợi nhuận ước tính" value={formatVnd(currentTotals.profit)} caption="Hoa hồng − vận chuyển − chi phí vận hành được ghi nhận." accent="violet" trend={{ value: financeTrend(currentTotals.profit, previousTotals.profit), label: 'so với kỳ trước' }} />
        <FinanceCard title="Chi phí vận chuyển" value={formatVnd(currentTotals.shipping)} caption="Chi phí vận chuyển thực tế do Admin ghi nhận." accent="blue" trend={{ value: financeTrend(currentTotals.shipping, previousTotals.shipping), label: 'so với kỳ trước' }} />
        <FinanceCard title="Công nợ phải trả doanh nghiệp" value={formatVnd(currentTotals.payable)} caption="Số còn lại trên các kỳ đối soát thuộc khoảng thời gian chọn." accent="violet" trend={{ value: financeTrend(currentTotals.payable, previousTotals.payable), label: 'so với kỳ trước' }} />
        <FinanceCard title="Tổng tiền đã chi trả" value={formatVnd(currentTotals.paid)} caption="Các payout có thời điểm chuyển trong khoảng thời gian chọn." accent="amber" trend={{ value: financeTrend(currentTotals.paid, previousTotals.paid), label: 'so với kỳ trước' }} />
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Doanh thu và lợi nhuận theo thời gian</h2>
            <p className="mt-1 text-xs text-slate-500">Di chuột lên các điểm để xem giá trị cụ thể.</p>
          </div>
          <FinanceTrendChart points={[...pointsByKey.values()]} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Cơ cấu tài chính</h2>
          <FinanceComposition values={[
            { label: 'Doanh thu hoa hồng', amount: currentTotals.commission, color: '#e11d48' },
            { label: 'Chi phí vận chuyển', amount: currentTotals.shipping, color: '#f59e0b' },
            { label: 'Chi phí vận hành', amount: currentTotals.operating, color: '#0f766e' },
            { label: 'Lợi nhuận ước tính', amount: Math.max(currentTotals.profit, 0), color: '#7c3aed' },
          ]} />
        </section>
      </div>

      <div className="mt-5">
        <FinancePartnerTable rows={partners} />
      </div>

      <section className="mt-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Giao dịch tài chính gần đây</h2>
            <p className="mt-1 text-xs text-slate-500">Tiền thu, tiền chi và khoản recover được phân biệt theo màu.</p>
          </div>
          <a href="/admin/finance/transactions" className="text-sm font-medium text-emerald-800 hover:underline">Xem toàn bộ giao dịch →</a>
        </div>
        <FinanceTransactionTable transactions={transactions} showFilters={false} />
      </section>
    </FinanceWorkspace>
  );
}
