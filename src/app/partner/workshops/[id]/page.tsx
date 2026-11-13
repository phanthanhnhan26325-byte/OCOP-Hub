import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatVnd } from '@/lib/money';
import { sessionStatuses, workshopDate, workshopStatuses, workshopStatusTone } from '@/modules/partner/workshop-list';

const tabs = { info: 'Thông tin', schedule: 'Lịch tổ chức', registrations: 'Người đăng ký', history: 'Lịch sử xét duyệt' };
const registrationLabels: Record<string, string> = { PENDING: 'Chờ thanh toán', PAYMENT_PROCESSING: 'Đang thanh toán', CONFIRMED: 'Đã xác nhận', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', COMPLETED: 'Đã tham gia', REFUNDED: 'Đã hoàn tiền' };

export default async function PartnerWorkshopDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; session?: string; page?: string }>;
}) {
  const user = await requireApprovedPartner();
  const { id } = await params;
  const query = await searchParams;
  const tab = query.tab && Object.hasOwn(tabs, query.tab) ? query.tab as keyof typeof tabs : 'info';
  const db = await supabaseServer();
  const { data: workshop, error } = await db.from('workshops')
    .select('id, title, description, experience_content, cover_image, status, reject_reason, updated_at, workshop_sessions(id, starts_at, ends_at, location, fee, capacity, remaining_seats, status)')
    .eq('id', id).eq('partner_id', user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!workshop) notFound();
  const sessions = workshop.workshop_sessions.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const sessionIds = sessions.map(s => s.id);
  const selectedSession = sessions.find(s => s.id === query.session);
  const base = `/partner/workshops/${workshop.id}`;
  // All privileged reads are scoped to the workshop verified above.
  const admin = supabaseAdmin();
  const { count, error: countError } = sessionIds.length
    ? await admin.from('workshop_registrations').select('id', { count: 'exact', head: true }).in('session_id', sessionIds)
    : { count: 0, error: null };
  if (countError) throw new Error(countError.message);
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page ?? '1', 10) || 1));

  async function registrationPanel() {
    const { data, error, count: total } = sessionIds.length ? await admin.from('workshop_registrations')
      .select('id, code, session_id, status, amount, created_at, users!customer_id(full_name, email, phone)', { count: 'exact' })
      .in('session_id', selectedSession ? [selectedSession.id] : sessionIds)
      .order('created_at', { ascending: false }).order('id').range((page - 1) * 50, page * 50 - 1) : { data: [], error: null, count: 0 };
    if (error) throw new Error(error.message);
    const href = (p: number) => `${base}?tab=registrations${selectedSession ? `&session=${selectedSession.id}` : ''}&page=${p}`;
    return <section className="partner-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5"><h2 className="font-semibold">{selectedSession ? `Người đăng ký · ${workshopDate(selectedSession.starts_at)}` : 'Tất cả người đăng ký'} ({total ?? 0})</h2>{selectedSession && <Link href={`${base}?tab=registrations`} className="text-sm text-emerald-800 underline">Xem tất cả các buổi</Link>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-[#f7faf8] text-xs partner-muted"><tr>{['Người đăng ký', 'Mã đăng ký', 'Buổi tổ chức', 'Trạng thái', 'Phí', 'Ngày đăng ký'].map(t => <th key={t} className="px-5 py-4 font-medium">{t}</th>)}</tr></thead><tbody>{data?.map(row => {
        const person = Array.isArray(row.users) ? row.users[0] : row.users;
        const session = sessions.find(s => s.id === row.session_id);
        return <tr key={row.id} className="border-t border-[#eaf0ec]"><td className="px-5 py-4"><p className="font-medium">{person?.full_name || 'Chưa có tên'}</p><p className="mt-1 text-xs partner-muted">{person?.email}</p><p className="text-xs partner-muted">{person?.phone}</p></td><td className="px-5 py-4">{row.code}</td><td className="px-5 py-4">{session && workshopDate(session.starts_at)}</td><td className="px-5 py-4">{registrationLabels[row.status] ?? row.status}</td><td className="px-5 py-4">{formatVnd(row.amount)}</td><td className="px-5 py-4">{workshopDate(row.created_at)}</td></tr>;
      })}</tbody></table></div>
      {!data?.length && <p className="p-8 text-center text-sm partner-muted">Chưa có người đăng ký.</p>}
      <div className="flex items-center justify-end gap-4 p-5 text-sm">{page > 1 && <Link href={href(page - 1)}>Trang trước</Link>}<span>Trang {page}</span>{page * 50 < (total ?? 0) && <Link href={href(page + 1)}>Trang sau</Link>}</div>
    </section>;
  }

  async function historyPanel() {
    const { data, error } = await admin.from('audit_logs').select('id, after, created_at')
      .eq('entity_type', 'workshop').eq('entity_id', workshop!.id).eq('action', 'WORKSHOP_REVIEW')
      .order('created_at', { ascending: false }).order('id').range((page - 1) * 50, page * 50);
    if (error) throw new Error(error.message);
    return <section className="partner-panel p-6"><h2 className="font-semibold">Lịch sử xét duyệt</h2><ol className="mt-5 space-y-5">{data?.slice(0, 50).map(item => {
      const after = item.after as { decision?: string; reason?: string } | null;
      return <li key={item.id} className="border-l-2 border-emerald-200 pl-4"><p className="text-sm font-medium">{after?.decision ? workshopStatuses[after.decision] ?? after.decision : 'Đã xét duyệt'}</p><p className="mt-1 text-xs partner-muted">{workshopDate(item.created_at)}</p>{after?.reason && <p className="mt-2 whitespace-pre-line text-sm">{after.reason}</p>}</li>;
    })}</ol>{!data?.length && <p className="mt-5 text-sm partner-muted">Chưa có lịch sử xét duyệt được ghi nhận.</p>}{data && data.length > 50 && <Link href={`${base}?tab=history&page=${page + 1}`} className="mt-5 inline-block text-sm underline">Xem tiếp</Link>}{page > 1 && <Link href={`${base}?tab=history&page=${page - 1}`} className="ml-4 mt-5 inline-block text-sm underline">Trang trước</Link>}</section>;
  }

  return <div className="w-full">
    <Link href="/partner/workshops" className="text-sm font-medium text-[#195c46] hover:underline">← Quay lại danh sách workshop</Link>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-medium sm:text-[32px]">{workshop.title}</h1><p className="mt-2 text-sm partner-muted">Cập nhật lần cuối: {workshopDate(workshop.updated_at)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-2 text-xs font-medium ${workshopStatusTone(workshop.status)}`}>{workshopStatuses[workshop.status] ?? workshop.status}</span><Link href={`${base}/edit`} className="partner-action">Sửa</Link></div></div>
    <nav aria-label="Chi tiết workshop" className="mb-6 mt-7 flex overflow-x-auto border-b border-[#dce6e1]">{Object.entries(tabs).map(([key, label]) => <Link key={key} href={`${base}?tab=${key}`} aria-current={key === tab ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium ${key === tab ? 'border-[#195c46] text-[#195c46]' : 'border-transparent text-[#738787]'}`}>{label}{key === 'registrations' && <span className="ml-2 rounded-full bg-[#eaf4ee] px-2 py-0.5 text-xs">{count ?? 0}</span>}</Link>)}</nav>
    {tab === 'info' && <section className="partner-panel space-y-6 p-6">{workshop.cover_image && <img src={workshop.cover_image} alt={workshop.title} className="max-h-96 w-full rounded-xl object-cover" />}<div><h2 className="font-semibold">Mô tả ngắn</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 partner-muted">{workshop.description || 'Chưa có mô tả.'}</p></div><div><h2 className="font-semibold">Nội dung trải nghiệm</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 partner-muted">{workshop.experience_content || 'Chưa có nội dung trải nghiệm.'}</p></div>{workshop.status === 'REJECTED' && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Lý do từ chối: {workshop.reject_reason || 'Chưa ghi nhận lý do.'}</p>}</section>}
    {tab === 'schedule' && <div className="space-y-5">{sessions.map(session => {
      const reserved = Math.max(0, session.capacity - session.remaining_seats);
      return <section key={session.id} className="partner-panel p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-5"><div><span className="rounded-full bg-[#eaf4ee] px-3 py-1 text-xs text-[#195c46]">{sessionStatuses[session.status] ?? session.status}</span><h2 className="mt-3 font-medium">{workshopDate(session.starts_at)} – {workshopDate(session.ends_at)}</h2><p className="mt-2 text-sm partner-muted">{session.location}</p><p className="mt-1 text-xs partner-muted">{formatVnd(session.fee)} / khách</p></div><div className="min-w-40"><p className="text-xl font-semibold">{reserved}/{session.capacity}</p><p className="text-xs partner-muted">chỗ đã được giữ</p><progress aria-label="Số chỗ đã giữ" value={reserved} max={session.capacity} className="mt-2 h-2 w-full accent-[#195c46]" /><p className="mt-1 text-xs partner-muted">Còn {session.remaining_seats} chỗ</p></div><Link href={`${base}?tab=registrations&session=${session.id}`} className="partner-action">Xem người đăng ký</Link></div></section>;
    })}{!sessions.length && <p className="partner-panel p-8 text-center partner-muted">Chưa có lịch tổ chức.</p>}</div>}
    {tab === 'registrations' && await registrationPanel()}
    {tab === 'history' && await historyPanel()}
  </div>;
}
