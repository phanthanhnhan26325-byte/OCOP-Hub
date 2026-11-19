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
  const productGmv = snapshot.orders.reduce((sum, order) => sum + Number(order.subtotal) - order.refunded_share, 0);
  const workshopGmv = snapshot.workshopRegistrations.reduce((sum, registration) => sum + Number(registration.amount) - registration.refund, 0);
  const gmv = productGmv + workshopGmv;
  const commission = snapshot.orders.reduce((sum, order) => sum + order.commission, 0)
    + snapshot.workshopRegistrations.reduce((sum, registration) => sum + Number(registration.platform_fee), 0);
  const operating = snapshot.expenses.filter((item) => item.expense_type === 'OPERATING').reduce((sum, item) => sum + Number(item.amount), 0);
  return { gmv, productGmv, workshopGmv, commission, operating };
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
    pointsByKey.set(key, { label: key, gmv: 0, commission: 0, operating: 0, profit: 0 });
  }
  for (const order of snapshot.orders) {
    const point = pointsByKey.get(financeGroupKey(order.recognized_at, grouping));
    if (!point) continue;
    point.gmv += Number(order.subtotal) - order.refunded_share;
    point.commission += order.commission;
    point.profit += order.commission;
  }
  for (const registration of snapshot.workshopRegistrations) {
    const point = pointsByKey.get(financeGroupKey(registration.recognized_at, grouping));
    if (point) {
      point.gmv += Number(registration.amount) - registration.refund;
      point.commission += Number(registration.platform_fee);
      point.profit += Number(registration.platform_fee);
    }
  }
  for (const expense of snapshot.expenses) {
    const point = pointsByKey.get(financeGroupKey(expense.incurred_at, grouping));
    if (!point) continue;
    point.operating += Number(expense.amount);
    point.profit -= Number(expense.amount);
  }

  const categoryTotals = new Map<string, { category: string; quantity: number; sales: number }>();
  for (const order of snapshot.orders) {
    for (const item of order.order_items ?? []) {
      const product = firstFinanceRelation(item.products);
      const category = firstFinanceRelation(product?.product_categories)?.name ?? 'Chưa phân loại';
      const row = categoryTotals.get(category) ?? { category, quantity: 0, sales: 0 };
      if (!order.refunded_share) row.quantity += item.qty;
      row.sales += order.original_subtotal > 0
        ? Number(item.line_total) * (Number(order.subtotal) - order.refunded_share) / order.original_subtotal
        : 0;
      categoryTotals.set(category, row);
    }
  }
  const categories = [...categoryTotals.values()].sort((a, b) => b.sales - a.sales);

  type PartnerRevenue = ReturnType<typeof groupFinanceOrders>[number] & {
    workshopCount: number;
    workshopRevenue: number;
  };
  const partnersById = new Map<string, PartnerRevenue>();
  for (const partner of groupFinanceOrders(snapshot.orders)) {
    partnersById.set(partner.partnerId, { ...partner, workshopCount: 0, workshopRevenue: 0 });
  }
  const workshopsById = new Map<string, {
    id: string;
    title: string;
    partnerName: string;
    registrations: number;
    revenue: number;
    commission: number;
  }>();
  for (const registration of snapshot.workshopRegistrations) {
    const partner = partnersById.get(registration.partner_id) ?? {
      partnerId: registration.partner_id,
      name: registration.partner_name,
      orderCount: 0,
      gmv: 0,
      commission: 0,
      refunds: 0,
      workshopCount: 0,
      workshopRevenue: 0,
    };
    partner.gmv += Number(registration.amount);
    partner.refunds += registration.refund;
    partner.commission += Number(registration.platform_fee);
    if (!registration.refund) partner.workshopCount += 1;
    partner.workshopRevenue += Number(registration.amount) - registration.refund;
    partnersById.set(partner.partnerId, partner);

    const workshop = workshopsById.get(registration.workshop_id) ?? {
      id: registration.workshop_id,
      title: registration.workshop_title,
      partnerName: registration.partner_name,
      registrations: 0,
      revenue: 0,
      commission: 0,
    };
    if (!registration.refund) workshop.registrations += 1;
    workshop.revenue += Number(registration.amount) - registration.refund;
    workshop.commission += Number(registration.platform_fee);
    workshopsById.set(workshop.id, workshop);
  }
  const partnerRevenue = [...partnersById.values()].sort((a, b) => b.gmv - a.gmv);
  const workshopRevenue = [...workshopsById.values()].sort((a, b) => b.revenue - a.revenue);
  const partnerRows: FinancePartnerRow[] = partnerRevenue.map((partner) => {
    const statements = snapshot.statements.filter((item) => item.partner_id === partner.partnerId);
    const statement = statements[0];
    return {
      ...partner,
      gmv: partner.gmv - partner.refunds,
      payable: statement
        ? statements.reduce((sum, item) => sum + Math.max(Number(item.net_payable) - (snapshot.paidByStatement[item.id] ?? 0), 0), 0)
        : Math.max(partner.gmv - partner.refunds - partner.commission, 0),
      status: statement?.status === 'PAID' ? 'Đã chi trả'
        : statement?.status === 'CONFIRMED' ? 'Đã xác nhận'
          : statement ? 'Nháp' : 'Chưa đối soát',
      statementId: statement?.id ?? null,
    };
  });

  const exportRows = [
    ...partnerRevenue.map((partner) => [
      'Doanh nghiệp',
      partner.name,
      `${partner.orderCount} đơn SP · ${partner.workshopCount} lượt workshop`,
      partner.gmv,
      partner.commission,
    ]),
    ...categories.map((category) => ['Nhóm sản phẩm', category.category, category.quantity, category.sales, '']),
    ...workshopRevenue.map((workshop) => ['Workshop', `${workshop.title} · ${workshop.partnerName}`, workshop.registrations, workshop.revenue, workshop.commission]),
  ];

  return (
    <FinanceWorkspace
      active="/admin/finance/revenue"
      title="Doanh thu & lợi nhuận"
      description="Phân tích doanh thu sản phẩm và workshop của doanh nghiệp, hoa hồng nền tảng, chi phí thực tế và lợi nhuận ước tính."
    >
      <FinanceDateFilters range={range.range} from={range.from} to={range.to} grouping={grouping} />
      <div className="mt-4 grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
        <FinanceCard title="GMV" value={formatVnd(current.gmv)} caption="Tiền hàng và workshop đủ điều kiện, sau hoàn tiền." accent="emerald" trend={{ value: financeTrend(current.gmv, previous.gmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Doanh thu sản phẩm" value={formatVnd(current.productGmv)} caption="Tiền hàng đủ điều kiện, sau hoàn tiền." accent="violet" trend={{ value: financeTrend(current.productGmv, previous.productGmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Doanh thu workshop" value={formatVnd(current.workshopGmv)} caption="Đăng ký workshop đã thanh toán và đồng bộ." accent="blue" trend={{ value: financeTrend(current.workshopGmv, previous.workshopGmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Phí sàn giữ lại" value={formatVnd(current.commission)} caption="10% tiền hàng và workshop đủ điều kiện, sau phần hoàn." accent="rose" trend={{ value: financeTrend(current.commission, previous.commission), label: 'so với kỳ trước' }} />
        <FinanceCard title="Chi phí vận hành" value={formatVnd(current.operating)} caption="Các khoản vận hành được ghi sổ." accent="amber" trend={{ value: financeTrend(current.operating, previous.operating), label: 'so với kỳ trước' }} />
      </div>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Xu hướng tài chính</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">GMV, phí, chi phí và lợi nhuận được nhóm theo {grouping === 'day' ? 'ngày' : grouping === 'week' ? 'tuần' : grouping === 'month' ? 'tháng' : grouping === 'quarter' ? 'quý' : 'năm'}.</p>
        <FinanceTrendChart points={[...pointsByKey.values()]} grouping={grouping} />
      </section>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Báo cáo doanh thu</h2>
          <p className="mt-1 text-sm text-slate-500">Tệp CSV có BOM, mở trực tiếp bằng Excel; chứa doanh thu theo doanh nghiệp, nhóm sản phẩm và workshop.</p>
        </div>
        <FinanceExportButton
          filename={`ocop-finance-${range.from}-${range.to}.csv`}
          headers={['Loại báo cáo', 'Tên', 'Đơn sản phẩm / lượt workshop', 'GMV / doanh thu', 'Hoa hồng']}
          rows={exportRows}
        />
      </div>
      <div className="mt-4">
        <FinancePartnerTable rows={partnerRows} />
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Doanh thu sản phẩm theo nhóm</h2>
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

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Doanh thu theo workshop</h2>
          <p className="mt-1 text-xs text-slate-500">Chỉ tính đăng ký đã thanh toán, đồng bộ và được xác nhận hoặc hoàn thành; phí sàn là 10%.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-3">Workshop</th><th className="px-4 py-3">Doanh nghiệp</th><th className="px-4 py-3 text-right">Lượt đăng ký</th><th className="px-4 py-3 text-right">Doanh thu sau hoàn</th><th className="px-4 py-3 text-right">Phí sàn</th><th className="px-4 py-3 text-right">Doanh nghiệp nhận</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workshopRevenue.map((workshop) => (
                <tr key={workshop.id}>
                  <td className="px-4 py-3 font-medium">{workshop.title}</td>
                  <td className="px-4 py-3">{workshop.partnerName}</td>
                  <td className="px-4 py-3 text-right">{workshop.registrations.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-medium">{formatVnd(workshop.revenue)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">{formatVnd(workshop.commission)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-medium">{formatVnd(workshop.revenue - workshop.commission)}</td>
                </tr>
              ))}
              {workshopRevenue.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chưa có doanh thu workshop trong kỳ.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </FinanceWorkspace>
  );
}
