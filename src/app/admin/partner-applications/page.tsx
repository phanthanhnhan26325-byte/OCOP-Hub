import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { ReviewControls } from '@/components/admin/ReviewControls';
import { formatDate } from '@/lib/money';

export const dynamic = 'force-dynamic';

type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const statusLabels: Record<ApplicationStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
};

const statusStyles: Record<ApplicationStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
};

const statusPriority: Record<ApplicationStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
};

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const statusFilter =
    params.status === 'PENDING' ||
    params.status === 'APPROVED' ||
    params.status === 'REJECTED'
      ? params.status as ApplicationStatus
      : null;
  const supabase = await supabaseServer();
  let applicationsQuery = supabase
    .from('partner_applications')
    .select('id, note, status, created_at, partner_id, partner_profiles(business_name, business_license_no, address, contact_email, contact_phone)')
    .eq('status', 'PENDING')
    .order('created_at');


  if (error) {
    console.error('Loading partner applications failed:', error);
    return (
      <div>
        <h1 className="text-2xl font-bold">Phê duyệt đăng ký bán hàng</h1>
        <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">
          Không tải được hồ sơ đăng ký bán hàng. Vui lòng kiểm tra cấu hình bảng, quan hệ và quyền truy cập Supabase. Chi tiết lỗi nằm trong terminal chạy website.
        </p>
      </div>
    );
  }
  const recentApplications = (applications ?? [])
    .map((application) => ({
      ...application,
      status: application.status as ApplicationStatus,
      partner: application.partner_profiles as unknown as {
        business_name: string;
        business_license_no: string;
        address: string | null;
        contact_email: string | null;
        contact_phone: string | null;
      } | null,
    }))
    .sort((a, b) => {
      const priorityDifference = statusPriority[a.status] - statusPriority[b.status];
      return priorityDifference || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div>
      <h1 className="text-2xl font-bold">Phê duyệt đăng ký bán hàng</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tối đa 10 hồ sơ gần nhất. Hồ sơ chờ duyệt được ưu tiên hiển thị trước.
      </p>

      <nav aria-label="Lọc hồ sơ theo trạng thái" className="mt-5 flex flex-wrap gap-2">
        {([
          { label: 'Tất cả', status: null },
          { label: 'Chờ duyệt', status: 'PENDING' },
          { label: 'Đã phê duyệt', status: 'APPROVED' },
          { label: 'Đã từ chối', status: 'REJECTED' },
        ] as const).map(({ label, status }) => {
          const active = statusFilter === status;
          const href = status ? `/admin/partner-applications?status=${status}` : '/admin/partner-applications';

          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                active
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-800'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3">Doanh nghiệp</th>
              <th className="px-4 py-3">Thông tin liên hệ</th>
              <th className="px-4 py-3">Ngày gửi</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ngày duyệt</th>
              <th className="px-4 py-3">Ghi chú / lý do</th>
              <th className="px-4 py-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {recentApplications.map((application) => (
              <tr key={application.id} className="border-b border-slate-50 align-top hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <p className="font-medium">{application.partner?.business_name ?? 'Doanh nghiệp'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    GPKD: {application.partner?.business_license_no ?? '—'}
                  </p>
                  {application.partner?.address && (
                    <p className="mt-1 text-xs text-slate-500">{application.partner.address}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p>{application.partner?.contact_email ?? 'Chưa có email'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {application.partner?.contact_phone ?? 'Chưa có số điện thoại'}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {formatDate(application.created_at)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[application.status]}`}>
                    {statusLabels[application.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {application.reviewed_at ? formatDate(application.reviewed_at) : '—'}
                </td>
                <td className="max-w-56 px-4 py-3 text-slate-600">
                  {application.status === 'REJECTED' && application.reject_reason
                    ? application.reject_reason
                    : application.note || '—'}
                </td>
                <td className="px-4 py-3">
                  {application.status === 'PENDING' ? (
                    <ReviewControls endpoint={`/api/admin/partner-applications/${application.id}/review`} />
                  ) : (
                    <span className="text-slate-400">Đã xử lý</span>
                  )}
                </td>
              </tr>
            ))}
            {recentApplications.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {statusFilter
                    ? `Không có hồ sơ ${statusLabels[statusFilter].toLocaleLowerCase('vi-VN')}.`
                    : 'Chưa có hồ sơ đăng ký bán hàng.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
