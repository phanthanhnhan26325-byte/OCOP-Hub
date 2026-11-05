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
  experience_content: string | null;
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
    .select('id, partner_id, title, slug, description, experience_content, cover_image, status, reject_reason, created_at, updated_at, partner_profiles(business_name), workshop_sessions(id, starts_at, ends_at, location, fee, capacity, remaining_seats, status, workshop_registrations(id, code, status, amount, created_at))')
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
  const confirmedRegistrations = registrations.filter(
    (registration) => registration.status === 'CONFIRMED' || registration.status === 'COMPLETED',
  );
  const totalSold = confirmedRegistrations.length;
  const totalRevenue = confirmedRegistrations.reduce((total, registration) => total + Number(registration.amount), 0);
  const now = new Date().getTime();

  return (
    <div>
      <Link href="/admin/workshops" className="text-sm font-medium text-emerald-800 hover:underline">
        ← Quay lại danh sách workshop
      </Link>

      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{workshop.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Doanh nghiệp: <Link href={`/admin/users/${workshop.partner_id}`} className="font-medium text-emerald-800 hover:underline">
                {partner?.business_name ?? 'Chưa có thông tin'}
              </Link>
            </p>
            <p className="mt-1 text-xs text-slate-400">Mã workshop: {workshop.id} · /{workshop.slug}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
            {workshopStatusLabel(workshop.status)}
          </span>
        </div>
        {workshop.description && <p className="mt-4 whitespace-pre-line text-sm text-slate-600">{workshop.description}</p>}
        {workshop.experience_content && <section className="mt-5"><h2 className="font-semibold">Nội dung trải nghiệm</h2><p className="mt-2 whitespace-pre-line text-sm text-slate-600">{workshop.experience_content}</p></section>}
        <p className="mt-3 text-xs text-slate-500">
          Tạo {formatDate(workshop.created_at)} · Cập nhật {formatDate(workshop.updated_at)}
        </p>
        {workshop.status === 'REJECTED' && workshop.reject_reason && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Lý do từ chối: {workshop.reject_reason}</p>
        )}
        {workshop.status === 'PENDING' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <ReviewControls endpoint={`/api/admin/workshops/${workshop.id}/review`} />
          </div>
        )}
      </article>

      <section aria-label="Tổng quan workshop" className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Số lịch tổ chức', value: sessions.length },
          { label: 'Vé đã xác nhận', value: totalSold },
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
        <div className="mt-3 space-y-3">
          {sessions.map((session) => {
            const confirmed = (session.workshop_registrations ?? []).filter(
              (registration) => registration.status === 'CONFIRMED' || registration.status === 'COMPLETED',
            ).length;
            const available = Math.max(session.remaining_seats, 0);
            return (
              <article key={session.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{formatDate(session.starts_at)} – {formatDate(session.ends_at)}</h3>
                    <p className="mt-1 text-sm text-slate-500">{session.location}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                    {sessionStatusLabel(session, now)}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                  <span>Giá vé: {formatVnd(session.fee)}</span>
                  <span>Đã bán: {confirmed}/{session.capacity}</span>
                  <span>Còn trống: {available}</span>
                  <span>Trạng thái phiên: {session.status}</span>
                </div>
                {(session.status === 'OPEN' || session.status === 'CLOSED') && (
                  <div className="mt-3">
                    <WorkshopSessionControls
                      sessionId={session.id}
                      status={session.status}
                      workshopStatus={workshop.status}
                    />
                  </div>
                )}
                {(session.workshop_registrations ?? []).length > 0 && (
                  <details className="mt-3 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-emerald-800">
                      Danh sách đăng ký ({session.workshop_registrations?.length})
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
              </article>
            );
          })}
          {sessions.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
              Workshop chưa có lịch tổ chức.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
