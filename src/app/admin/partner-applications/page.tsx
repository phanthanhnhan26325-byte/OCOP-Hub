import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { ReviewControls } from '@/components/admin/ReviewControls';
import { formatDate } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminApplicationsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: apps, error } = await supabase
    .from('partner_applications')
    .select('id, note, status, created_at, partner_id, partner_profiles(business_name, business_license_no, address, contact_email, contact_phone)')
    .eq('status', 'PENDING')
    .order('created_at');
  if (error) throw new Error(error.message);

  return (
    <div>
      <h1 className="text-2xl font-bold">Phê duyệt đăng ký bán hàng</h1>
      <div className="mt-6 space-y-4">
        {(apps ?? []).map((a) => {
          const p = a.partner_profiles as unknown as { business_name: string; business_license_no: string; address: string; contact_email: string; contact_phone: string } | null;
          return (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold">{p?.business_name}</h3>
              <p className="text-sm text-slate-500">GPKD: {p?.business_license_no} · {p?.contact_email} · {p?.contact_phone}</p>
              <p className="text-sm text-slate-500">Địa chỉ: {p?.address}</p>
              <p className="text-xs text-slate-400">Gửi lúc {formatDate(a.created_at)}{a.note ? ` · Ghi chú: ${a.note}` : ''}</p>
              <ReviewControls endpoint={`/api/admin/partner-applications/${a.id}/review`} />
            </div>
          );
        })}
        {(!apps || apps.length === 0) && <p className="text-slate-500">Không có hồ sơ chờ duyệt.</p>}
      </div>
    </div>
  );
}
