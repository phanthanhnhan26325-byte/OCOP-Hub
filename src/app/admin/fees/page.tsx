import { FeeConfigForm } from '@/components/admin/FeeConfigForm';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminFeesPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [{ data: configs, error: configError }, { data: partners, error: partnerError }] = await Promise.all([
    supabase.from('fee_config').select('id, scope, partner_id, type, rules, effective_from, effective_to').order('effective_from', { ascending: false }).limit(200),
    supabase.from('partner_profiles').select('user_id, business_name').order('business_name'),
  ]);
  if (configError) throw new Error(configError.message);
  if (partnerError) throw new Error(partnerError.message);

  const partnerNames = new Map((partners ?? []).map((partner) => [partner.user_id, partner.business_name]));
  return (
    <div>
      <h1 className="text-2xl font-bold">Cấu hình phí</h1>
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Tạo phiên bản phí áp dụng mới</h2>
        <p className="mt-1 text-sm text-slate-500">Tỷ lệ nền tảng dùng dạng thập phân (0.1 = 10%). Cấu hình cũ được lưu lịch sử, không xóa.</p>
        <FeeConfigForm partners={partners ?? []} />
      </section>
      <h2 className="mt-8 font-semibold">Lịch sử cấu hình</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-100 text-slate-500">
            <tr><th className="px-4 py-3">Phạm vi</th><th className="px-4 py-3">Loại phí</th><th className="px-4 py-3">Giá trị</th><th className="px-4 py-3">Hiệu lực</th></tr>
          </thead>
          <tbody>
            {(configs ?? []).map((config) => {
              const rules = config.rules as { rate?: number; flat?: number };
              const value = config.type === 'PLATFORM_RATE'
                ? `${((rules.rate ?? 0) * 100).toLocaleString('vi-VN')}%`
                : `${Number(rules.flat ?? 0).toLocaleString('vi-VN')} đ`;
              return (
                <tr key={config.id} className="border-b border-slate-50">
                  <td className="px-4 py-3">{config.scope === 'GLOBAL' ? 'Toàn hệ thống' : partnerNames.get(config.partner_id ?? '') ?? 'Doanh nghiệp'}</td>
                  <td className="px-4 py-3">{config.type === 'PLATFORM_RATE' ? 'Phí nền tảng' : 'Phí vận chuyển'}</td>
                  <td className="px-4 py-3 font-medium">{value}</td>
                  <td className="px-4 py-3 text-slate-500">{new Date(config.effective_from).toLocaleString('vi-VN')} – {config.effective_to ? new Date(config.effective_to).toLocaleString('vi-VN') : 'Đang áp dụng'}</td>
                </tr>
              );
            })}
            {(!configs || configs.length === 0) && <tr><td colSpan={4} className="px-4 py-5 text-center text-slate-500">Chưa có cấu hình phí.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
