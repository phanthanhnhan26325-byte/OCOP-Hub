import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { WorkshopSessionControls } from '@/components/admin/WorkshopSessionControls';
import { ReviewControls } from '@/components/admin/ReviewControls';
import { formatDate, formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface WorkshopDetail {
  id: string;
  partner_id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  status: string;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  partner_profiles: { business_name: string } | { business_name: string }[] | null;
  workshop_sessions: {
    id: string;
    starts_at: string;
    ends_at: string;
    location: string;
    fee: number | string;
    capacity: number;
    remaining_seats: number;
    status: string;
    workshop_registrations: {
      id: string;
      code: string;
      status: string;
      amount: number | string;
      created_at: string;
    }[] | null;
  }[] | null;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function sessionStatusLabel(session: WorkshopDetail['workshop_sessions'] extends (infer T)[] | null ? T : never, now: number) {
  if (session.status === 'CANCELLED') return 'Đã hủy';
  if (new Date(session.ends_at).getTime() < now) return 'Đã quá hạn';
  if (new Date(session.starts_at).getTime() > now) return 'Chưa tới ngày';
  return 'Đang diễn ra';
}

function workshopStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Bản nháp',
    PENDING: 'Chờ duyệt',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Bị từ chối',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] ?? status;
}

export default async function AdminWorkshopDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('workshops')
    .select('id, partner_id, title, slug, description, cover_image, status, reject_reason, created_at, updated_at, partner_profiles(business_name), workshop_sessions(id, starts_at, ends_at, location, fee, capacity, remaining_seats, status, workshop_registrations(id, code, status, amount, created_at))')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const workshop = data as unknown as WorkshopDetail;
  const partner = firstRelation(workshop.partner_profiles);
  const sessions = [...(workshop.workshop_sessions ?? [])].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
  const registrations = sessions.flatMap((session) => session.workshop_registrations ?? []);
  const activeSessions = sessions.filter((session) => session.status !== 'CANCELLED');
  const confirmedRegistrations = registrations.filter(
    (registration) => registration.status === 'CONFIRMED' || registration.status === 'COMPLETED',
  );
  const totalCapacity = activeSessions.reduce((total, session) => total + session.capacity, 0);
  const totalRemaining = activeSessions.reduce((total, session) => total + session.remaining_seats, 0);
  const totalBooked = totalCapacity - totalRemaining;
  const totalRevenue = confirmedRegistrations.reduce((total, registration) => total + Number(registration.amount), 0);
  const now = new Date().getTime();

  return (
    <div>
      <Link href="/admin/workshops" className="text-sm font-medium text-emerald-800 hover:underline">
        ← Quay lại danh sách workshop
      </Link>

      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          {workshop.cover_image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workshop.cover_image}
              alt={workshop.title}
              className="h-52 w-full rounded-lg object-cover sm:w-72"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-2xl font-bold">{workshop.title}</h1>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                {workshopStatusLabel(workshop.status)}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Đơn vị tổ chức:{' '}
              <Link href={`/admin/users/${workshop.partner_id}`} className="font-medium text-emerald-800 hover:underline">
                {partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}
              </Link>
            </p>
            <p className="mt-1 text-xs text-slate-400">Mã workshop: {workshop.id} · /{workshop.slug}</p>
            <p className="mt-1 text-xs text-slate-500">
              Tạo {formatDate(workshop.created_at)} · Cập nhật {formatDate(workshop.updated_at)}
            </p>
            {workshop.description && (
              <p className="mt-4 whitespace-pre-line text-sm text-slate-600">{workshop.description}</p>
            )}
          </div>
        </div>
        {workshop.status === 'REJECTED' && workshop.reject_reason && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Lý do từ chối: {workshop.reject_reason}</p>
        )}
        {workshop.status === 'PENDING' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <ReviewControls endpoint={`/api/admin/workshops/${workshop.id}/review`} />
          </div>
        )}
      </article>

      <section aria-label="Tổng quan workshop" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Số lịch tổ chức', value: sessions.length },
          { label: 'Tổng số vé', value: totalCapacity },
          { label: 'Vé đã đặt', value: totalBooked },
          { label: 'Vé còn', value: totalRemaining },
          { label: 'Doanh thu đăng ký đã xác nhận', value: formatVnd(totalRevenue) },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="mt-1 font-semibold">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Lịch tổ chức và tình hình vé</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Ngày, giờ</th>
                <th className="px-4 py-3">Địa điểm</th>
                <th className="px-4 py-3">Giá vé</th>
                <th className="px-4 py-3">Số lượng vé</th>
                <th className="px-4 py-3">Vé đã đặt</th>
                <th className="px-4 py-3">Vé còn</th>
                <th className="px-4 py-3">Trạng thái / đăng ký</th>
              </tr>
            </thead>
            <tbody>
          {sessions.map((session) => {
            const available = Math.max(session.remaining_seats, 0);
            const booked = Math.max(session.capacity - available, 0);
            return (
              <tr key={session.id} className="border-b border-slate-50 align-top hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-3">
                  <p>{formatDate(session.starts_at)}</p>
                  <p className="mt-1 text-xs text-slate-500">đến {formatDate(session.ends_at)}</p>
                </td>
                <td className="px-4 py-3">{session.location}</td>
                <td className="whitespace-nowrap px-4 py-3">{formatVnd(session.fee)}</td>
                <td className="px-4 py-3">{session.capacity}</td>
                <td className="px-4 py-3">{booked}</td>
                <td className="px-4 py-3 font-medium">{available}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                    {sessionStatusLabel(session, now)}
                  </span>
                  {(session.status === 'OPEN' || session.status === 'CLOSED') && (
                    <div className="mt-2">
                    <WorkshopSessionControls
                      sessionId={session.id}
                      status={session.status}
                      workshopStatus={workshop.status}
                    />
                    </div>
                  )}
                  {(session.workshop_registrations ?? []).length > 0 && (
                    <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-emerald-800">
                      Đăng ký ({session.workshop_registrations?.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {(session.workshop_registrations ?? []).map((registration) => (
                        <li key={registration.id} className="flex flex-wrap justify-between gap-2">
                          <span>{registration.code} · {registration.status} · {formatDate(registration.created_at)}</span>
                          <span>{formatVnd(registration.amount)}</span>
                        </li>
                      ))}
                    </ul>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Workshop chưa có lịch tổ chức.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
