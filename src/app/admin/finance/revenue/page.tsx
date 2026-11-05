import { FinanceCard, FinanceDateFilters, FinanceWorkspace } from '@/components/admin/FinanceWorkspace';
import { FinanceTrendChart, type FinanceChartPoint } from '@/components/admin/FinanceVisualizations';
import { FinanceExportButton, FinancePartnerTable, type FinancePartnerRow } from '@/components/admin/FinanceTables';
import { financeDateRange, financeBucketDates, financeGroupKey, financeTrend, firstFinanceRelation, groupFinanceOrders, loadFinanceSnapshot, previousFinanceRange } from '@/lib/admin-finance';
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
  const shipping = snapshot.expenses.filter((item) => item.expense_type === 'SHIPPING').reduce((sum, item) => sum + Number(item.amount), 0);
  const operating = snapshot.expenses.filter((item) => item.expense_type === 'OPERATING').reduce((sum, item) => sum + Number(item.amount), 0);
  return { gmv, commission, shipping, operating, profit: commission - shipping - operating };
}

export default async function AdminFinanceRevenue({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[]; group?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const range = financeDateRange(firstParam(params.range), firstParam(params.from), firstParam(params.to));
  const prior = previousFinanceRange(range);
  const acceptedGroups = ['day', 'week', 'month', 'quarter', 'year'];
  const requestedGroup = firstParam(params.group);
  const grouping = acceptedGroups.includes(requestedGroup) ? requestedGroup : 'month';
  const supabase = await supabaseServer();
  const [snapshot, previousSnapshot] = await Promise.all([
    loadFinanceSnapshot(supabase, range),
    loadFinanceSnapshot(supabase, prior),
  ]);
  const current = totals(snapshot);
  const previous = totals(previousSnapshot);

  const pointsByKey = new Map<string, FinanceChartPoint>();
  for (const key of financeBucketDates(range, grouping)) {
    pointsByKey.set(key, { label: key, gmv: 0, commission: 0, shipping: 0, operating: 0, profit: 0 });
  }
  for (const order of snapshot.orders) {
    const point = pointsByKey.get(financeGroupKey(order.placed_at, grouping));
    if (!point) continue;
    point.gmv += Number(order.subtotal);
    point.commission += order.commission;
    point.profit += order.commission;
  }
  for (const expense of snapshot.expenses) {
    const point = pointsByKey.get(financeGroupKey(expense.incurred_at.slice(0, 10), grouping));
    if (!point) continue;
    if (expense.expense_type === 'SHIPPING') point.shipping += Number(expense.amount);
    else point.operating += Number(expense.amount);
    point.profit -= Number(expense.amount);
  }

  const categoryTotals = new Map<string, { category: string; quantity: number; sales: number }>();
  for (const order of snapshot.orders) {
    for (const item of order.order_items ?? []) {
      const product = firstFinanceRelation(item.products);
      const category = firstFinanceRelation(product?.product_categories)?.name ?? 'Chưa phân loại';
      const row = categoryTotals.get(category) ?? { category, quantity: 0, sales: 0 };
      row.quantity += item.qty;
      row.sales += Number(item.line_total);
      categoryTotals.set(category, row);
    }
  }
  const categories = [...categoryTotals.values()].sort((a, b) => b.sales - a.sales);

  const grouped = groupFinanceOrders(snapshot.orders);
  const partnerRows: FinancePartnerRow[] = grouped.map((partner) => {
    const statement = snapshot.statements.find((item) => item.partner_id === partner.partnerId);
    return {
      ...partner,
      payable: statement
        ? Math.max(Number(statement.net_payable) - (snapshot.paidByStatement[statement.id] ?? 0), 0)
        : Math.max(partner.gmv - partner.refunds - partner.commission, 0),
      status: statement?.status === 'PAID' ? 'Đã chi trả'
        : statement?.status === 'CONFIRMED' ? 'Đã xác nhận'
          : statement ? 'Nháp' : 'Chưa đối soát',
      statementId: statement?.id ?? null,
    };
  });

  const exportRows = [
    ...grouped.map((partner) => ['Doanh nghiệp', partner.name, partner.orderCount, partner.gmv, partner.commission]),
    ...categories.map((category) => ['Nhóm sản phẩm', category.category, category.quantity, category.sales, '']),
  ];

  return (
    <FinanceWorkspace
      active="/admin/finance/revenue"
      title="Doanh thu & lợi nhuận"
      description="Phân tích GMV, hoa hồng nền tảng, chi phí thực tế và lợi nhuận ước tính; doanh thu đối tác không được tính là doanh thu OCOP Hub."
    >
      <FinanceDateFilters range={range.range} from={range.from} to={range.to} grouping={grouping} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FinanceCard title="GMV" value={formatVnd(current.gmv)} caption="Giá trị hàng hóa đủ điều kiện." accent="emerald" trend={{ value: financeTrend(current.gmv, previous.gmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Doanh thu hoa hồng" value={formatVnd(current.commission)} caption="Phí nền tảng đã chụp trên đơn, trừ phần hoàn." accent="rose" trend={{ value: financeTrend(current.commission, previous.commission), label: 'so với kỳ trước' }} />
        <FinanceCard title="Chi phí vận chuyển" value={formatVnd(current.shipping)} caption="Chỉ chi phí thực tế đã ghi nhận." accent="blue" trend={{ value: financeTrend(current.shipping, previous.shipping), label: 'so với kỳ trước' }} />
        <FinanceCard title="Chi phí vận hành" value={formatVnd(current.operating)} caption="Các khoản vận hành được ghi sổ." accent="amber" trend={{ value: financeTrend(current.operating, previous.operating), label: 'so với kỳ trước' }} />
        <FinanceCard title="Lợi nhuận ước tính" value={formatVnd(current.profit)} caption="Hoa hồng − chi phí vận chuyển − vận hành." accent="violet" trend={{ value: financeTrend(current.profit, previous.profit), label: 'so với kỳ trước' }} />
      </div>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Xu hướng tài chính</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">GMV, phí, chi phí và lợi nhuận được nhóm theo {grouping === 'day' ? 'ngày' : grouping === 'week' ? 'tuần' : grouping === 'month' ? 'tháng' : grouping === 'quarter' ? 'quý' : 'năm'}.</p>
        <FinanceTrendChart points={[...pointsByKey.values()]} />
      </section>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Báo cáo doanh thu</h2>
          <p className="mt-1 text-sm text-slate-500">Tệp CSV có BOM, mở trực tiếp bằng Excel; chứa doanh thu theo doanh nghiệp và nhóm sản phẩm.</p>
        </div>
        <FinanceExportButton
          filename={`ocop-finance-${range.from}-${range.to}.csv`}
          headers={['Loại báo cáo', 'Tên', 'Số đơn / sản phẩm', 'GMV / doanh thu', 'Hoa hồng']}
          rows={exportRows}
        />
      </div>
      <div className="mt-4">
        <FinancePartnerTable rows={partnerRows} />
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Doanh thu theo nhóm sản phẩm</h2>
          <p className="mt-1 text-xs text-slate-500">Phân nhóm theo danh mục hiện tại của sản phẩm; đơn hàng và giá vẫn lấy từ snapshot đặt hàng.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Nhóm sản phẩm</th><th className="px-4 py-3">Số lượng bán</th><th className="px-4 py-3">Giá trị hàng hóa</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((category) => <tr key={category.category}><td className="px-4 py-3 font-medium">{category.category}</td><td className="px-4 py-3">{category.quantity.toLocaleString('vi-VN')}</td><td className="px-4 py-3 font-medium">{formatVnd(category.sales)}</td></tr>)}
              {categories.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Chưa có doanh thu sản phẩm trong kỳ.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </FinanceWorkspace>
  );
}
