import { FinanceWorkspace, FinanceDateFilters, FinanceCard } from '@/components/admin/FinanceWorkspace';
import { FinanceComposition, FinanceTrendChart, type FinanceChartPoint } from '@/components/admin/FinanceVisualizations';
import { FinancePartnerTable, FinanceTransactionTable, type FinancePartnerRow } from '@/components/admin/FinanceTables';
import { loadFinanceSnapshot, financeDateRange, financeBucketDates, financeGroupKey, financeTrend, firstFinanceRelation, groupFinanceOrders, previousFinanceRange, type FinanceSnapshot } from '@/lib/admin-finance';
import { loadFinanceTransactions } from '@/lib/admin-finance-transactions';
import { formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

function scopeSnapshot(snapshot: FinanceSnapshot, partnerId: string): FinanceSnapshot {
  if (!partnerId) return snapshot;
  const statements = snapshot.statements.filter((statement) => statement.partner_id === partnerId);
  const statementIds = new Set(statements.map((statement) => statement.id));
  return {
    ...snapshot,
    orders: snapshot.orders.filter((order) => order.partner_id === partnerId),
    workshopRegistrations: snapshot.workshopRegistrations.filter((registration) => registration.partner_id === partnerId),
    statements,
    payouts: snapshot.payouts.filter((payout) => payout.partner_id === partnerId),
    recoveries: snapshot.recoveries.filter((recovery) => recovery.partner_id === partnerId),
    paidByStatement: Object.fromEntries(
      Object.entries(snapshot.paidByStatement).filter(([id]) => statementIds.has(id)),
    ),
  };
}

function totals(snapshot: FinanceSnapshot, partnerScoped: boolean) {
  const productGmv = snapshot.orders.reduce((sum, order) => sum + Number(order.subtotal), 0);
  const workshopGmv = snapshot.workshopRegistrations.reduce((sum, registration) => sum + Number(registration.amount), 0);
  const gmv = productGmv + workshopGmv;
  const shippingCollected = snapshot.orders.reduce((sum, order) => sum + Number(order.shipping_fee), 0);
  const refunds = snapshot.orders.reduce((sum, order) => sum + order.refunded_share, 0);
  const workshopCommission = snapshot.workshopRegistrations.reduce((sum, registration) => sum + Number(registration.platform_fee), 0);
  const productCommission = snapshot.orders.reduce((sum, order) => sum + order.commission, 0);
  const commission = productCommission + workshopCommission;
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
  return {
    productGmv,
    workshopGmv,
    gmv,
    customerCollected: gmv + shippingCollected - refunds,
    refunds,
    commission,
    businessReceivable: Math.max(gmv - refunds - commission, 0),
    shipping,
    operating,
    profit: commission - (partnerScoped ? 0 : shipping + operating),
    payable,
    paid,
  };
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
    partner?: string | string[];
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
  const [snapshotResult, previousSnapshotResult, partnersResult] = await Promise.all([
    loadFinanceSnapshot(supabase, range),
    loadFinanceSnapshot(supabase, previous),
    supabase.from('partner_profiles').select('user_id, business_name').eq('selling_status', 'APPROVED').order('business_name'),
  ]);
  if (partnersResult.error) throw new Error(partnersResult.error.message);
  const partnerOptions = partnersResult.data ?? [];
  const requestedPartnerId = firstParam(params.partner);
  const selectedPartnerId = partnerOptions.some((partner) => partner.user_id === requestedPartnerId)
    ? requestedPartnerId
    : '';
  const snapshot = scopeSnapshot(snapshotResult, selectedPartnerId);
  const previousSnapshot = scopeSnapshot(previousSnapshotResult, selectedPartnerId);
  const partnerScoped = Boolean(selectedPartnerId);
  const currentTotals = totals(snapshot, partnerScoped);
  const previousTotals = totals(previousSnapshot, partnerScoped);
  const transactions = partnerScoped
    ? []
    : await loadFinanceTransactions(
      supabase,
      range,
      snapshot.orders,
      snapshot.expenses,
      snapshot.payouts,
      snapshot.recoveries,
      10,
      snapshot.workshopRegistrations,
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
  for (const registration of snapshot.workshopRegistrations) {
    const key = financeGroupKey(registration.created_at, grouping);
    const point = pointsByKey.get(key);
    if (point) {
      point.gmv += Number(registration.amount);
      point.commission += Number(registration.platform_fee);
      point.profit += Number(registration.platform_fee);
    }
  }
  for (const expense of snapshot.expenses) {
    if (partnerScoped) continue;
    const key = financeGroupKey(expense.incurred_at.slice(0, 10), grouping);
    const point = pointsByKey.get(key);
    if (point) {
      if (expense.expense_type === 'SHIPPING') point.shipping += Number(expense.amount);
      else point.operating += Number(expense.amount);
      point.profit -= Number(expense.amount);
    }
  }

  type PartnerGroup = ReturnType<typeof groupFinanceOrders>[number] & { workshopCount: number };
  const groupsByPartner = new Map<string, PartnerGroup>();
  for (const group of groupFinanceOrders(snapshot.orders)) {
    groupsByPartner.set(group.partnerId, { ...group, workshopCount: 0 });
  }
  for (const registration of snapshot.workshopRegistrations) {
    const group = groupsByPartner.get(registration.partner_id) ?? {
      partnerId: registration.partner_id,
      name: registration.partner_name,
      orderCount: 0,
      gmv: 0,
      commission: 0,
      refunds: 0,
      workshopCount: 0,
    };
    group.gmv += Number(registration.amount);
    group.commission += Number(registration.platform_fee);
    group.workshopCount += 1;
    groupsByPartner.set(group.partnerId, group);
  }
  const groups = [...groupsByPartner.values()].sort((a, b) => b.gmv - a.gmv);
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
  const productRowsById = new Map<string, {
    id: string;
    name: string;
    partnerName: string;
    quantity: number;
    revenue: number;
    refunds: number;
    commission: number;
  }>();
  for (const order of snapshot.orders) {
    const partnerName = firstFinanceRelation(order.partner_profiles)?.business_name ?? 'Doanh nghiệp';
    const subtotal = Number(order.subtotal);
    for (const item of order.order_items ?? []) {
      const key = `${order.partner_id}:${item.product_id}`;
      const row = productRowsById.get(key) ?? {
        id: key,
        name: item.product_name,
        partnerName,
        quantity: 0,
        revenue: 0,
        refunds: 0,
        commission: 0,
      };
      const itemRevenue = Number(item.line_total);
      const share = subtotal > 0 ? itemRevenue / subtotal : 0;
      row.quantity += item.qty;
      row.revenue += itemRevenue;
      row.refunds += order.refunded_share * share;
      row.commission += order.commission * share;
      productRowsById.set(key, row);
    }
  }
  const productRows = [...productRowsById.values()].sort((a, b) => b.revenue - a.revenue);
  const workshopRowsById = new Map<string, {
    id: string;
    name: string;
    partnerName: string;
    registrations: number;
    revenue: number;
    commission: number;
  }>();
  for (const registration of snapshot.workshopRegistrations) {
    const row = workshopRowsById.get(registration.workshop_id) ?? {
      id: registration.workshop_id,
      name: registration.workshop_title,
      partnerName: registration.partner_name,
      registrations: 0,
      revenue: 0,
      commission: 0,
    };
    row.registrations += 1;
    row.revenue += Number(registration.amount);
    row.commission += Number(registration.platform_fee);
    workshopRowsById.set(row.id, row);
  }
  const workshopRows = [...workshopRowsById.values()].sort((a, b) => b.revenue - a.revenue);
  const selectedPartnerName = partnerOptions.find((partner) => partner.user_id === selectedPartnerId)?.business_name;

  return (
    <FinanceWorkspace
      active="/admin/finance"
      title="Tổng quan tài chính"
      description="Theo dõi tiền khách thanh toán, phí sàn 10%, khoản doanh nghiệp được nhận và lợi nhuận theo sản phẩm, workshop."
    >
      <FinanceDateFilters
        range={range.range}
        from={range.from}
        to={range.to}
        grouping={grouping}
        partners={partnerOptions}
        partnerId={selectedPartnerId}
      />
      <p className="mt-3 text-xs text-slate-500">
        Kỳ báo cáo: {range.from} — {range.to}{selectedPartnerName ? ` · Doanh nghiệp: ${selectedPartnerName}` : ''}. Chỉ tính giao dịch đã thanh toán và đồng bộ; phí sàn tính 10% cho sản phẩm và workshop.
      </p>

      <section aria-label="Chỉ số tài chính" className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <FinanceCard title="Tiền khách đã thanh toán" value={formatVnd(currentTotals.customerCollected)} caption="Sản phẩm + workshop + vận chuyển − hoàn tiền." accent="emerald" trend={{ value: financeTrend(currentTotals.customerCollected, previousTotals.customerCollected), label: 'so với kỳ trước' }} />
        <FinanceCard title="GMV sản phẩm + workshop" value={formatVnd(currentTotals.gmv)} caption={`Sản phẩm ${formatVnd(currentTotals.productGmv)} · Workshop ${formatVnd(currentTotals.workshopGmv)}.`} accent="emerald" trend={{ value: financeTrend(currentTotals.gmv, previousTotals.gmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Phí sàn giữ lại (10%)" value={formatVnd(currentTotals.commission)} caption="Phí sản phẩm đã ghi nhận và phí workshop 10%, sau phần hoàn." accent="rose" trend={{ value: financeTrend(currentTotals.commission, previousTotals.commission), label: 'so với kỳ trước' }} />
        <FinanceCard title="Doanh nghiệp được nhận (ước tính)" value={formatVnd(currentTotals.businessReceivable)} caption="Doanh thu gộp − hoàn tiền − phí sàn; chưa trừ các payout đã chuyển." accent="blue" trend={{ value: financeTrend(currentTotals.businessReceivable, previousTotals.businessReceivable), label: 'so với kỳ trước' }} />
        <FinanceCard title="Doanh thu sản phẩm" value={formatVnd(currentTotals.productGmv)} caption="Giá trị đơn sản phẩm đủ điều kiện trong kỳ." accent="emerald" trend={{ value: financeTrend(currentTotals.productGmv, previousTotals.productGmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Doanh thu workshop" value={formatVnd(currentTotals.workshopGmv)} caption="Đăng ký workshop đã thanh toán và đồng bộ." accent="blue" trend={{ value: financeTrend(currentTotals.workshopGmv, previousTotals.workshopGmv), label: 'so với kỳ trước' }} />
        <FinanceCard title="Lợi nhuận ước tính" value={formatVnd(currentTotals.profit)} caption={partnerScoped ? 'Phí sàn của doanh nghiệp; chưa phân bổ chi phí chung.' : 'Phí sàn − vận chuyển − chi phí vận hành được ghi nhận.'} accent="violet" trend={{ value: financeTrend(currentTotals.profit, previousTotals.profit), label: 'so với kỳ trước' }} />
        <FinanceCard title="Chi phí vận chuyển" value={formatVnd(currentTotals.shipping)} caption={partnerScoped ? 'Chi phí toàn sàn; không phân bổ theo doanh nghiệp.' : 'Chi phí vận chuyển thực tế do Admin ghi nhận.'} accent="blue" trend={{ value: financeTrend(currentTotals.shipping, previousTotals.shipping), label: 'so với kỳ trước' }} />
        <FinanceCard title="Chi phí vận hành" value={formatVnd(currentTotals.operating)} caption={partnerScoped ? 'Chi phí toàn sàn; không phân bổ theo doanh nghiệp.' : 'Các khoản vận hành được Admin ghi nhận.'} accent="amber" trend={{ value: financeTrend(currentTotals.operating, previousTotals.operating), label: 'so với kỳ trước' }} />
        <FinanceCard title="Công nợ phải trả doanh nghiệp" value={formatVnd(currentTotals.payable)} caption="Số còn lại trên các kỳ đối soát thuộc khoảng thời gian chọn." accent="violet" trend={{ value: financeTrend(currentTotals.payable, previousTotals.payable), label: 'so với kỳ trước' }} />
        <FinanceCard title="Tổng tiền đã chi trả" value={formatVnd(currentTotals.paid)} caption="Các payout có thời điểm chuyển trong khoảng thời gian chọn." accent="amber" trend={{ value: financeTrend(currentTotals.paid, previousTotals.paid), label: 'so với kỳ trước' }} />
      </section>

      <div className="mt-5 grid gap-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold text-slate-900">Doanh thu và lợi nhuận theo thời gian</h2>
            <p className="mt-1 text-xs text-slate-500">Di chuột lên các điểm để xem giá trị cụ thể.</p>
          </div>
          <FinanceTrendChart points={[...pointsByKey.values()]} grouping={grouping} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-semibold text-slate-900">Cơ cấu tài chính</h2>
          <FinanceComposition
            revenue={currentTotals.commission}
            profit={currentTotals.profit}
          />
        </section>
      </div>

      <div className="mt-5">
        <FinancePartnerTable rows={partners} />
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-900">Doanh thu từng sản phẩm</h2>
          <p className="mt-1 text-xs text-slate-500">Phí sàn và khoản doanh nghiệp nhận được phân bổ theo tỷ trọng giá trị từng sản phẩm.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-3">Sản phẩm</th><th className="px-4 py-3">Doanh nghiệp</th><th className="px-4 py-3 text-right">SL bán</th><th className="px-4 py-3 text-right">Doanh thu gộp</th><th className="px-4 py-3 text-right">Hoàn tiền</th><th className="px-4 py-3 text-right">Phí sàn</th><th className="px-4 py-3 text-right">DN nhận ước tính</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.partnerName}</td>
                  <td className="px-4 py-3 text-right">{row.quantity.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">{formatVnd(row.revenue)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">{formatVnd(row.refunds)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">{formatVnd(row.commission)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-medium">{formatVnd(Math.max(row.revenue - row.refunds - row.commission, 0))}</td>
                </tr>
              ))}
              {productRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Không có sản phẩm đủ điều kiện trong kỳ này.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold text-slate-900">Doanh thu từng workshop</h2>
          <p className="mt-1 text-xs text-slate-500">Workshop cũng chịu phí sàn theo mức 10%; số doanh nghiệp nhận được là doanh thu trừ phí sàn.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr><th className="px-4 py-3">Workshop</th><th className="px-4 py-3">Doanh nghiệp</th><th className="px-4 py-3 text-right">Lượt đăng ký</th><th className="px-4 py-3 text-right">Doanh thu gộp</th><th className="px-4 py-3 text-right">Phí sàn</th><th className="px-4 py-3 text-right">DN nhận ước tính</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workshopRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.partnerName}</td>
                  <td className="px-4 py-3 text-right">{row.registrations.toLocaleString('vi-VN')}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">{formatVnd(row.revenue)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">{formatVnd(row.commission)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right font-medium">{formatVnd(Math.max(row.revenue - row.commission, 0))}</td>
                </tr>
              ))}
              {workshopRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Không có workshop đủ điều kiện trong kỳ này.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Giao dịch tài chính gần đây</h2>
            <p className="mt-1 text-xs text-slate-500">Tiền thu, tiền chi và khoản recover được phân biệt theo màu.</p>
          </div>
          <a href="/admin/finance/transactions" className="text-sm font-medium text-emerald-800 hover:underline">Xem toàn bộ giao dịch →</a>
        </div>
        {partnerScoped
          ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Giao dịch thu/chi gần đây chỉ tổng hợp ở phạm vi toàn sàn; doanh thu theo doanh nghiệp được thể hiện trong hai bảng chi tiết phía trên.</p>
          : <FinanceTransactionTable transactions={transactions} showFilters={false} />}
      </section>
    </FinanceWorkspace>
  );
}
