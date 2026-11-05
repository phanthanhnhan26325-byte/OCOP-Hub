import { FinanceExpenseForm } from '@/components/admin/FinanceExpenseForm';
import { FinanceWorkspace } from '@/components/admin/FinanceWorkspace';
import { formatDate, formatVnd } from '@/lib/money';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminFinanceSettings() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [{ data: feeData, error: feeError }, { data: expenseData, error: expenseError }, { data: recoveryData, error: recoveryError }] = await Promise.all([
    supabase.from('fee_config').select('id, scope, type, rules, effective_from, effective_to').eq('scope', 'GLOBAL').is('partner_id', null).order('effective_from', { ascending: false }).limit(50),
    supabase.from('financial_expenses').select('id, expense_type, description, amount, incurred_at, reference_code').order('incurred_at', { ascending: false }).limit(30),
    supabase.from('partner_recoveries').select('id, partner_id, refund_id, order_id, amount, recovered_amount, created_at, partner_profiles(business_name)').order('created_at', { ascending: false }).limit(100),
  ]);
  if (feeError) throw new Error(feeError.message);
  if (expenseError) throw new Error(expenseError.message);
  if (recoveryError) throw new Error(recoveryError.message);

  const feeRows = (feeData ?? []) as unknown as {
    id: string;
    type: string;
    rules: { rate?: number; flat?: number };
    effective_from: string;
    effective_to: string | null;
  }[];
  const now = new Date().toISOString();
  const activeCommission = feeRows.find((row) => row.type === 'PLATFORM_RATE' && row.effective_from <= now && (!row.effective_to || row.effective_to > now));
  const activeShipping = feeRows.find((row) => row.type === 'SHIPPING' && row.effective_from <= now && (!row.effective_to || row.effective_to > now));
  const expenses = (expenseData ?? []) as unknown as {
    id: string;
    expense_type: string;
    description: string;
    amount: number | string;
    incurred_at: string;
    reference_code: string | null;
  }[];
  const recoveries = (recoveryData ?? []) as unknown as {
    id: string;
    partner_id: string;
    refund_id: string;
    order_id: string;
    amount: number | string;
    recovered_amount: number | string;
    created_at: string;
    partner_profiles: { business_name: string } | { business_name: string }[] | null;
  }[];
  const openRecoveries = recoveries.filter((row) => Number(row.amount) > Number(row.recovered_amount));
  const outstandingRecovery = openRecoveries.reduce((sum, row) => sum + Number(row.amount) - Number(row.recovered_amount), 0);

  return (
    <FinanceWorkspace
      active="/admin/finance/settings"
      title="Cấu hình tài chính"
      description="Chính sách đang áp dụng và sổ chi phí thực tế. Trang này không thay đổi chính sách phí hiện hành."
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Loại hoa hồng</p>
          <p className="mt-2 font-semibold">Tỷ lệ cố định</p>
          <p className="mt-1 text-xs text-slate-500">Theo phí đã chụp trên đơn hàng.</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Hoa hồng nền tảng</p>
          <p className="mt-2 font-semibold">10% theo chính sách</p>
          <p className="mt-1 text-xs text-slate-500">
            Cấu hình toàn hệ thống: {activeCommission ? `${((activeCommission.rules.rate ?? 0) * 100).toLocaleString('vi-VN')}%` : 'Chưa có phiên bản cấu hình toàn hệ thống'}.
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Phí vận chuyển</p>
          <p className="mt-2 font-semibold">OCOP Hub chịu chi phí thực tế</p>
          <p className="mt-1 text-xs text-slate-500">
            Phí thu theo cấu hình hiện tại: {activeShipping ? formatVnd(activeShipping.rules.flat ?? 0) : 'Chưa cấu hình'}; không thay thế chi phí thực tế ghi nhận.
          </p>
        </article>
        <article className="rounded-xl border border-violet-100 bg-violet-50 p-4">
          <p className="text-xs text-violet-700">Đối soát / hoàn sau chi trả</p>
          <p className="mt-2 font-semibold text-violet-900">Hàng tháng · Recover</p>
          <p className="mt-1 text-xs text-violet-700">Khoản hoàn sau payout được lưu công nợ riêng và khấu trừ kỳ sau.</p>
        </article>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Ghi nhận chi phí thực tế</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Chỉ nhập chi phí đã phát sinh. Chi phí vận chuyển và vận hành được dùng trong KPI/lợi nhuận theo thời điểm phát sinh.</p>
        <FinanceExpenseForm />
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Sổ chi phí gần đây</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Thời điểm</th><th className="px-4 py-3">Loại</th><th className="px-4 py-3">Nội dung</th><th className="px-4 py-3">Mã chứng từ</th><th className="px-4 py-3 text-right">Số tiền</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.map((expense) => <tr key={expense.id}><td className="px-4 py-3">{formatDate(expense.incurred_at)}</td><td className="px-4 py-3">{expense.expense_type === 'SHIPPING' ? 'Vận chuyển' : 'Vận hành'}</td><td className="px-4 py-3">{expense.description}</td><td className="px-4 py-3 font-mono text-xs">{expense.reference_code ?? '—'}</td><td className="px-4 py-3 text-right font-medium">{formatVnd(expense.amount)}</td></tr>)}
              {expenses.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Chưa có chi phí thực tế được ghi nhận.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">Recover sau chi trả</h2>
          <p className="mt-1 text-xs text-slate-500">Tổng công nợ recover đang chờ khấu trừ: {formatVnd(outstandingRecovery)}.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Ngày ghi nhận</th><th className="px-4 py-3">Doanh nghiệp</th><th className="px-4 py-3">Mã hoàn tiền</th><th className="px-4 py-3">Khoản cần thu</th><th className="px-4 py-3">Đã recover</th><th className="px-4 py-3">Còn lại</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {recoveries.map((recovery) => {
                const partner = Array.isArray(recovery.partner_profiles) ? recovery.partner_profiles[0] : recovery.partner_profiles;
                const remaining = Number(recovery.amount) - Number(recovery.recovered_amount);
                return <tr key={recovery.id}><td className="px-4 py-3">{formatDate(recovery.created_at)}</td><td className="px-4 py-3">{partner?.business_name ?? 'Doanh nghiệp'}</td><td className="px-4 py-3 font-mono text-xs">{recovery.refund_id.slice(0, 8)}</td><td className="px-4 py-3">{formatVnd(recovery.amount)}</td><td className="px-4 py-3">{formatVnd(recovery.recovered_amount)}</td><td className={`px-4 py-3 font-medium ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{formatVnd(remaining)}</td></tr>;
              })}
              {recoveries.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chưa có khoản recover sau chi trả.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </FinanceWorkspace>
  );
}
