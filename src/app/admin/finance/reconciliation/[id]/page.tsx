import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SettlementActions } from '@/components/admin/SettlementActions';
import { FinancePrintButton } from '@/components/admin/FinancePrintButton';
import { FinanceWorkspace } from '@/components/admin/FinanceWorkspace';
import { formatDate, formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface SettlementItem {
  id: string;
  ref_type: string;
  ref_id: string;
  amount: number | string;
  direction: string;
  created_at: string;
}

interface SettlementOrder {
  id: string;
  code: string;
  status: string;
  subtotal: number | string;
  platform_fee: number | string;
  order_items: {
    product_name: string;
    qty: number;
    unit_price: number | string;
    line_total: number | string;
  }[] | null;
}

export default async function AdminFinanceStatementDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: statementData, error: statementError } = await supabase
    .from('settlement_statements')
    .select('id, partner_id, period_start, period_end, gross_amount, refund_amount, platform_fee, adjustments, net_payable, status, confirmed_at, created_at, partner_profiles(business_name), payouts(id, amount, method, ref_no, transferred_at, recorded_by, evidence_path), settlement_items(id, ref_type, ref_id, amount, direction, created_at)')
    .eq('id', id)
    .maybeSingle();
  if (statementError) throw new Error(statementError.message);
  if (!statementData) notFound();

  const statement = statementData as unknown as {
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
    confirmed_at: string | null;
    created_at: string;
    partner_profiles: { business_name: string } | { business_name: string }[] | null;
    payouts: { id: string; amount: number | string; method: string; ref_no: string; transferred_at: string; recorded_by: string | null; evidence_path: string | null }[] | null;
    settlement_items: SettlementItem[] | null;
  };
  const items = statement.settlement_items ?? [];
  const orderIds = items.filter((item) => item.ref_type === 'SUB_ORDER').map((item) => item.ref_id);
  const { data: orderData, error: orderError } = orderIds.length > 0
    ? await supabase.from('orders').select('id, code, status, subtotal, platform_fee, order_items(product_name, qty, unit_price, line_total)').in('id', orderIds)
    : { data: [], error: null };
  if (orderError) throw new Error(orderError.message);
  const orders = (orderData ?? []) as unknown as SettlementOrder[];
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const paid = (statement.payouts ?? []).reduce((sum, payout) => sum + Number(payout.amount), 0);
  const recoveryAmount = items
    .filter((item) => item.ref_type === 'RECOVERY')
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const additionalAdjustments = items
    .filter((item) => item.ref_type === 'ADJUSTMENT')
    .reduce((sum, item) => sum + (item.direction === 'DEBIT' ? -Number(item.amount) : Number(item.amount)), 0);
  const admin = supabaseAdmin();
  const payoutRows = await Promise.all((statement.payouts ?? []).map(async (payout) => {
    if (!payout.evidence_path) return { ...payout, evidence_url: null };
    const { data, error } = await admin.storage.from('ocop-settlement-payout-proofs-v1').createSignedUrl(payout.evidence_path, 300);
    if (error) throw new Error(error.message);
    return { ...payout, evidence_url: data.signedUrl };
  }));

  return (
    <FinanceWorkspace
      active="/admin/finance/reconciliation"
      title={`Biên bản đối soát ${statement.period_start.slice(0, 7)}`}
      description={`Doanh nghiệp ${Array.isArray(statement.partner_profiles) ? statement.partner_profiles[0]?.business_name : statement.partner_profiles?.business_name ?? 'đối tác'} · ${statement.period_start} — ${statement.period_end}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin/finance/reconciliation" className="text-sm font-medium text-emerald-800 hover:underline">← Danh sách đối soát</Link>
        <FinancePrintButton />
      </div>
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Mã kỳ đối soát</p>
            <p className="mt-1 font-mono font-semibold">{statement.id}</p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700">{statement.status}</span>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Tổng giá trị hàng hóa</dt><dd className="mt-1 font-semibold">{formatVnd(statement.gross_amount)}</dd></div>
          <div><dt className="text-xs text-slate-500">Hoa hồng nền tảng</dt><dd className="mt-1 font-semibold">{formatVnd(statement.platform_fee)}</dd></div>
          <div><dt className="text-xs text-slate-500">Hoàn tiền</dt><dd className="mt-1 font-semibold text-rose-700">−{formatVnd(statement.refund_amount)}</dd></div>
          <div><dt className="text-xs text-slate-500">Điều chỉnh</dt><dd className="mt-1 font-semibold">{formatVnd(additionalAdjustments)}</dd></div>
          <div><dt className="text-xs text-slate-500">Recover đã khấu trừ</dt><dd className="mt-1 font-semibold text-amber-700">−{formatVnd(recoveryAmount)}</dd></div>
          <div><dt className="text-xs text-slate-500">Số tiền phải trả</dt><dd className="mt-1 text-lg font-bold text-emerald-800">{formatVnd(statement.net_payable)}</dd></div>
          <div><dt className="text-xs text-slate-500">Đã chi trả</dt><dd className="mt-1 font-semibold">{formatVnd(paid)}</dd></div>
          <div><dt className="text-xs text-slate-500">Công nợ còn lại</dt><dd className="mt-1 font-semibold">{formatVnd(Math.max(Number(statement.net_payable) - paid, 0))}</dd></div>
        </dl>
        {statement.confirmed_at && <p className="mt-4 text-xs text-slate-500">Xác nhận lúc {formatDate(statement.confirmed_at)}.</p>}
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Chi tiết đơn hàng và sản phẩm</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-4 py-3">Mã đơn con</th><th className="px-4 py-3">Sản phẩm</th><th className="px-4 py-3">SL</th><th className="px-4 py-3">Đơn giá</th><th className="px-4 py-3">Thành tiền</th><th className="px-4 py-3">Hoa hồng lưu trên đơn</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderIds.flatMap((orderId) => {
                const order = ordersById.get(orderId);
                if (!order) return [];
                return (order.order_items ?? []).map((item, index) => (
                  <tr key={`${order.id}-${index}`}>
                    <td className="px-4 py-3 font-mono text-xs">{index === 0 ? order.code : ''}</td>
                    <td className="px-4 py-3">{item.product_name}</td>
                    <td className="px-4 py-3">{item.qty}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatVnd(item.unit_price)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatVnd(item.line_total)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{index === 0 ? formatVnd(order.platform_fee) : '—'}</td>
                  </tr>
                ));
              })}
              {orderIds.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Kỳ này chưa có đơn hàng đủ điều kiện.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Điều chỉnh, hoàn tiền và recover</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {items.filter((item) => item.ref_type !== 'SUB_ORDER').map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span>{item.ref_type} · {item.ref_id.slice(0, 8)} · {item.direction === 'DEBIT' ? 'Khấu trừ' : 'Ghi có'}</span>
              <span className={item.direction === 'DEBIT' ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>
                {item.direction === 'DEBIT' ? '−' : '+'}{formatVnd(item.amount)}
              </span>
            </li>
          ))}
          {items.every((item) => item.ref_type === 'SUB_ORDER') && <li className="py-3 text-sm text-slate-500">Không có khoản điều chỉnh, hoàn tiền hoặc recover.</li>}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Lịch sử chi trả thực tế</h2>
        <p className="mt-1 text-xs text-slate-500">Các khoản chi trả qua yêu cầu đối soát lưu mã giao dịch và chứng từ chuyển khoản riêng tư.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-3 py-2">Ngày chi</th><th className="px-3 py-2">Mã tham chiếu</th><th className="px-3 py-2">Phương thức</th><th className="px-3 py-2 text-right">Số tiền</th><th className="px-3 py-2">Chứng từ</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payoutRows.map((payout) => <tr key={payout.id}><td className="px-3 py-2">{formatDate(payout.transferred_at)}</td><td className="px-3 py-2 font-mono text-xs">{payout.ref_no}</td><td className="px-3 py-2">{payout.method}</td><td className="px-3 py-2 text-right font-medium">{formatVnd(payout.amount)}</td><td className="px-3 py-2">{payout.evidence_url ? <a href={payout.evidence_url} target="_blank" rel="noreferrer" className="text-emerald-800 underline">Mở chứng từ</a> : <span className="text-slate-400">—</span>}</td></tr>)}
              {(statement.payouts ?? []).length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-slate-500">Chưa có khoản chi trả.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="mt-4 print:hidden">
        <SettlementActions statementId={statement.id} net={Number(statement.net_payable) - paid} status={statement.status} />
      </section>
    </FinanceWorkspace>
  );
}
