import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { SellingApplicationForm } from '@/components/partner/SellingApplicationForm';

export const dynamic = 'force-dynamic';

export default async function PartnerDashboardPage() {
  const user = await requireRole('PARTNER');
  const supabase = await supabaseServer();
  const { data: profile } = await supabase.from('partner_profiles').select('*').eq('user_id', user.id).maybeSingle();
  const { data: apps } = await supabase
    .from('partner_applications')
    .select('*')
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5);
  const { data: stats } = await supabase
    .from('orders')
    .select('id, status, total')
    .eq('partner_id', user.id)
    .eq('order_level', 'CHILD');
  const pending = (stats ?? []).filter((s) => s.status === 'PENDING_ACCEPTANCE').length;
  const revenue = (stats ?? []).filter((s) => ['PAID', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(s.status))
    .reduce((sum, s) => sum + Number(s.total ?? 0), 0);

  const approved = profile?.selling_status === 'APPROVED';

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Khu vực doanh nghiệp</h1>
      <p className="mt-1 text-slate-600">{profile?.business_name ?? 'Chưa có hồ sơ doanh nghiệp'}</p>

      <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${approved ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {approved ? (
          <>✓ Đã được phê duyệt bán hàng. Bạn có thể đăng sản phẩm và tổ chức workshop.</>
        ) : profile?.selling_status === 'PENDING' ? (
          <>⏳ Hồ sơ bán hàng đang chờ Admin phê duyệt.</>
        ) : profile?.selling_status === 'REJECTED' ? (
          <>✕ Hồ sơ bị từ chối: {profile?.reject_reason ?? 'không rõ lý do'}</>
        ) : (
          <>Bạn cần gửi hồ sơ đăng ký bán hàng trước khi sử dụng chức năng bán hàng.</>
        )}
      </div>

      {!approved && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">Đăng ký quyền bán hàng</h2>
          <p className="mt-1 text-sm text-slate-500">Cung cấp thông tin doanh nghiệp để Admin xét duyệt.</p>
          <SellingApplicationForm existing={profile} />
        </div>
      )}

      {approved && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Đơn chờ xử lý</p>
              <p className="text-2xl font-bold">{pending}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Tổng doanh thu (đơn đã thanh toán)</p>
              <p className="text-2xl font-bold text-emerald-700">{formatVnd(revenue)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Trạng thái hồ sơ</p>
              <p className="text-2xl font-bold text-emerald-700">Đã duyệt</p>
            </div>
          </div>
          <nav className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              ['/partner/products', 'Quản lý sản phẩm'],
              ['/partner/workshops', 'Quản lý workshop'],
              ['/partner/orders', 'Quản lý phần đơn'],
              ['/partner/settlements', 'Đối soát & thanh toán'],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-xl border border-slate-200 bg-white px-4 py-4 font-medium hover:border-emerald-300 hover:shadow-sm">
                {label} →
              </Link>
            ))}
          </nav>
        </>
      )}

      {(apps ?? []).length > 0 && (
        <div className="mt-10">
          <h2 className="font-semibold">Lịch sử hồ sơ</h2>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {(apps ?? []).map((a) => (
              <li key={a.id}>#{a.id.slice(0, 8)} — {a.status} {a.reject_reason ? `(${a.reject_reason})` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
