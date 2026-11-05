import Link from 'next/link';
import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { PartnerIcon } from '@/components/partner/PartnerIcon';
import { WorkshopDetails } from '@/components/partner/WorkshopDetails';
import { SubmitWorkshopButton } from '@/components/partner/SubmitWorkshopButton';
import { DeleteButton } from '@/components/partner/DeleteButton';
import { nextWorkshopSession, workshopDate, workshopStatuses, workshopStatusTone, type PartnerWorkshop } from '@/modules/partner/workshop-list';

export const dynamic = 'force-dynamic';

export default async function PartnerWorkshopsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; status?: string | string[] }> }) {
  const user = await requireApprovedPartner();
  const db = await supabaseServer();
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const status = typeof params.status === 'string' && Object.hasOwn(workshopStatuses, params.status) ? params.status : '';
  const filtered = Boolean(q || status);
  const workshops: PartnerWorkshop[] = [];
  for (let from = 0; ; from += 500) {
    let query = db.from('workshops').select('id, title, description, cover_image, status, reject_reason, workshop_sessions(id, starts_at, ends_at, location, fee, capacity, remaining_seats, status, workshop_registrations(id, status))').eq('partner_id', user.id).order('created_at', { ascending: false }).order('id');
    if (q) query = query.ilike('title', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.range(from, from + 499);
    if (error) throw new Error(error.message);
    workshops.push(...data as PartnerWorkshop[]);
    if (data.length < 500) break;
  }
  const now = new Date();

  return <div className="mx-auto max-w-[1568px] px-4 py-8 sm:px-6 sm:py-10">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><h1 className="text-2xl font-medium tracking-tight sm:text-[32px]">Quản lý workshop</h1><p className="mt-2 text-sm leading-6 partner-muted">Theo dõi lịch tổ chức, lượt đăng ký và trạng thái phê duyệt của workshop.</p></div>
      <Link href="/partner/workshops/new" className="partner-action partner-action-primary"><PartnerIcon name="plus" />Tạo workshop</Link>
    </div>
    <section aria-label="Danh sách workshop" className="partner-panel mt-7 overflow-hidden">
      <form action="/partner/workshops" method="get" className="grid items-end gap-4 border-b border-[#eaf0ec] p-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:p-6">
        <label className="text-xs font-medium">Tìm workshop
          <span className="relative mt-2 block"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="absolute left-3 top-3 h-4 w-4 text-[#738787]"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input name="q" type="search" defaultValue={q} maxLength={100} placeholder="Nhập tên workshop…" className="w-full rounded-lg border border-[#dce6e1] bg-white py-2.5 pl-10 pr-3 text-sm font-normal" /></span>
        </label>
        <label className="text-xs font-medium">Trạng thái
          <select name="status" defaultValue={status} className="mt-2 w-full rounded-lg border border-[#dce6e1] bg-white px-3 py-2.5 text-sm font-normal"><option value="">Tất cả trạng thái</option>{Object.entries(workshopStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <button type="submit" className="rounded-lg bg-[#195c46] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#124a37]">Tìm kiếm & lọc</button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs sm:px-6"><p className="partner-muted">{filtered ? 'Tìm thấy' : 'Tổng cộng'} <span className="font-semibold text-[#195c46]">{workshops.length}</span> workshop{q ? ` cho “${q}”` : ''}</p>{filtered && <Link href="/partner/workshops" className="font-medium text-[#195c46] hover:underline">Xóa bộ lọc</Link>}</div>
      {workshops.length === 0 ? <div className="border-t border-[#eaf0ec] px-5 py-14 text-center"><span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="calendar" /></span><h2 className="text-base font-medium">{filtered ? 'Không tìm thấy workshop phù hợp' : 'Chưa có workshop nào'}</h2><p className="mt-2 text-sm partner-muted">{filtered ? 'Thử tên workshop khác hoặc thay đổi bộ lọc.' : 'Tạo workshop đầu tiên để chia sẻ trải nghiệm của doanh nghiệp với khách hàng.'}</p><Link href={filtered ? '/partner/workshops' : '/partner/workshops/new'} className="partner-action mt-5">{filtered ? 'Xem tất cả workshop' : 'Tạo workshop'}</Link></div> :
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
          <caption className="sr-only">Danh sách workshop của doanh nghiệp, mới nhất trước</caption>
          <thead className="border-y border-[#eaf0ec] bg-[#f7faf8] text-xs partner-muted"><tr>{['Workshop', 'Lịch tổ chức gần nhất', 'Địa điểm', 'Đăng ký', 'Trạng thái', 'Thao tác'].map(heading => <th key={heading} scope="col" className="px-6 py-4 font-medium">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#eaf0ec]">{workshops.map(workshop => {
            const next = nextWorkshopSession(workshop, now);
            const hasRegistrations = workshop.workshop_sessions.some(session => session.workshop_registrations.length > 0);
            const registered = next?.workshop_registrations.filter(registration => registration.status === 'CONFIRMED').length ?? 0;
            return <tr key={workshop.id} id={workshop.id} className="scroll-mt-28 transition hover:bg-[#f7faf8]">
              <td className="px-6 py-5"><div className="flex min-w-56 max-w-80 items-center gap-3">{workshop.cover_image ? <img src={workshop.cover_image} alt={workshop.title} className="h-16 w-16 shrink-0 rounded-xl border border-[#eaf0ec] object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="calendar" /></span>}<div className="min-w-0"><p className="font-semibold leading-5">{workshop.title}</p><p className="mt-1 text-xs partner-muted">{workshop.workshop_sessions.length} buổi tổ chức</p>{workshop.status === 'REJECTED' && workshop.reject_reason && <p className="mt-1 line-clamp-2 text-xs text-red-700">{workshop.reject_reason}</p>}</div></div></td>
              <td className="px-6 py-5">{next ? <><p className="whitespace-nowrap text-xs font-medium">{workshopDate(next.starts_at)}</p><p className="mt-1 text-xs partner-muted">{Number(next.fee) === 0 ? 'Miễn phí' : formatVnd(next.fee)} / khách</p></> : <p className="text-xs partner-muted">Chưa có buổi sắp tới</p>}</td>
              <td className="max-w-48 px-6 py-5 text-xs leading-5 partner-muted">{next?.location || '—'}</td>
              <td className="px-6 py-5">{next ? <><p className="whitespace-nowrap font-medium">{registered}/{next.capacity} chỗ</p><p className="mt-1 text-[11px] partner-muted">Buổi gần nhất</p></> : <span className="partner-muted">—</span>}</td>
              <td className="px-6 py-5"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${workshopStatusTone(workshop.status)}`}><span aria-hidden="true">●</span>{workshopStatuses[workshop.status] ?? workshop.status}</span></td>
              <td className="px-6 py-5"><div className="flex flex-wrap items-start gap-2"><WorkshopDetails workshop={workshop} /><Link href={`/partner/workshops/${workshop.id}/edit`} className="rounded-lg border border-[#cdded5] px-3 py-1.5 text-xs font-medium text-[#195c46] hover:bg-[#eaf4ee]">Sửa</Link>{workshop.status === 'DRAFT' && <SubmitWorkshopButton workshopId={workshop.id} />}<DeleteButton url={`/api/partner/workshops/${workshop.id}`} label="Xóa" disabledReason={hasRegistrations ? 'Workshop đã có lịch sử đăng ký nên không thể xóa.' : undefined} /></div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>
  </div>;
}
