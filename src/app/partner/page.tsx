import Link from 'next/link';
import type { ReactNode } from 'react';
import { getPartnerDashboard } from '@/modules/partner/dashboard.service';
import { formatVnd } from '@/lib/money';
import { SellingApplicationForm } from '@/components/partner/SellingApplicationForm';
import { RevenueFilter } from '@/components/partner/RevenueFilter';
import { RecentOrders } from '@/components/partner/RecentOrders';
import { PartnerIcon, type PartnerIconName } from '@/components/partner/PartnerIcon';

export const dynamic = 'force-dynamic';
const timeZone = 'Asia/Ho_Chi_Minh';
const datePart = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('vi-VN', { timeZone, ...options }).format(new Date(value));

function Metric({ label, value, note, badge, href, children }: { label: string; value: string; note: string; badge?: string; href?: string; children?: ReactNode }) {
  return <section className="partner-panel flex min-h-[180px] flex-col p-5 xl:p-6">
    <div className="flex items-center justify-between gap-3 text-sm partner-muted">{href ? <Link href={href} className="flex w-full items-center justify-between gap-2 hover:text-[#195c46]">{label}<PartnerIcon name="chevron" className="!h-4 !w-4" /></Link> : label}</div>
    <p className="my-5 text-[28px] font-semibold leading-tight tracking-tight sm:text-[30px]">{value}</p>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="partner-muted">{note}</span>{badge && <span className="rounded-md bg-[#eaf4ee] px-2 py-1.5 text-[#195c46]">{badge}</span>}</div>
    {children && <div className="mt-3 border-t border-[#edf1ee] pt-3">{children}</div>}
  </section>;
}

function Task({ icon, title, description, href, action, tone = 'green' }: { icon: PartnerIconName; title: string; description: string; href: string; action: string; tone?: 'green' | 'red' | 'amber' }) {
  const color = tone === 'red' ? 'bg-[#fae9e7] text-[#cc4943]' : tone === 'amber' ? 'bg-[#fcf3d9] text-[#9b7418]' : 'bg-[#eaf4ee] text-[#195c46]';
  return <li className="flex flex-wrap items-center gap-4 py-5">
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}><PartnerIcon name={icon} /></span>
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1.5 break-words text-xs leading-5 partner-muted">{description}</p></div>
    <Link href={href} className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#195c46] hover:underline">{action}<PartnerIcon name="chevron" className="!h-3.5 !w-3.5" /></Link>
  </li>;
}

export default async function PartnerDashboardPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const params = await searchParams;
  const data = await getPartnerDashboard(typeof params.month === 'string' ? params.month : undefined);
  const { profile, pending, upcoming } = data;
  const approved = profile?.selling_status === 'APPROVED';
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(data.now));
  const greeting = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const taskCount = Number(pending.length > 0) + data.rejectedWorkshops.length + data.rejectedProducts.length + Number(upcoming.length > 0);
  const today = datePart(data.now.toISOString(), { year: 'numeric', month: '2-digit', day: '2-digit' });
  const newToday = pending.filter(order => datePart(order.placed_at, { year: 'numeric', month: '2-digit', day: '2-digit' }) === today).length;
  const oldest = pending.reduce<number | null>((earliest, order) => Math.min(earliest ?? Infinity, new Date(order.placed_at).getTime()), null);
  const waitedHours = oldest ? Math.max(0, Math.floor((data.now.getTime() - oldest) / 3600000)) : 0;
  const profileTitle = approved ? 'Hồ sơ bán hàng đã được duyệt' : profile?.selling_status === 'PENDING' ? 'Hồ sơ bán hàng đang chờ phê duyệt' : profile?.selling_status === 'REJECTED' ? 'Hồ sơ bán hàng cần cập nhật' : profile?.selling_status === 'SUSPENDED' ? 'Quyền bán hàng đang tạm ngưng' : 'Hoàn thiện hồ sơ doanh nghiệp';
  const profileDescription = approved ? 'Doanh nghiệp có thể đăng sản phẩm và tổ chức workshop trên OCOP Hub.' : profile?.selling_status === 'PENDING' ? 'Hệ thống đang xem xét hồ sơ. Bạn sẽ nhận được thông báo khi có kết quả.' : profile?.reject_reason || 'Gửi thông tin doanh nghiệp để hệ thống xét duyệt quyền bán hàng.';

  return <div className="w-full">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><h1 className="text-2xl font-medium leading-snug tracking-tight sm:text-[32px]">{greeting}, {profile?.business_name || 'đối tác OCOP Hub'}</h1><p className="mt-2 text-sm leading-6 partner-muted">Đây là tình hình hoạt động của doanh nghiệp bạn hôm nay.</p></div>
      {approved && <div className="flex flex-wrap gap-3"><Link href="/partner/workshops/new" className="partner-action"><PartnerIcon name="plus" />Tạo workshop</Link><Link href="/partner/products/new" className="partner-action partner-action-primary"><PartnerIcon name="plus" />Thêm sản phẩm</Link></div>}
    </div>
    <section className={`mt-7 flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-5 ${approved ? 'border-[#cce5d8] bg-[#eaf4ee]' : 'border-[#eddfb4] bg-[#fff8e5]'}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${approved ? 'bg-[#195c46]' : 'bg-[#a57b20]'}`}><PartnerIcon name={approved ? 'check' : 'alert'} /></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{profileTitle}</h2><p className="mt-1.5 text-sm leading-6 partner-muted">{profileDescription}</p></div>
      <span className="rounded-full bg-white/25 px-3 py-1.5 text-xs font-medium text-[#195c46]">● {approved ? 'Đã duyệt' : profile?.selling_status === 'PENDING' ? 'Chờ duyệt' : 'Cần cập nhật'}</span>
    </section>
    {!approved && <section className="partner-panel mt-6 p-6"><h2 className="text-lg font-semibold">Đăng ký quyền bán hàng</h2><p className="mt-2 text-sm partner-muted">Cung cấp thông tin doanh nghiệp để Admin xét duyệt.</p><SellingApplicationForm existing={profile} /></section>}
    {approved && <>
      <div className="mt-6 grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Đơn chờ tiếp nhận" value={String(pending.length).padStart(2, '0')} note="Đơn khách đã đặt và thanh toán" badge={`${newToday} đơn mới hôm nay`} href="/partner/orders" />
        <Metric label="Doanh thu sản phẩm" value={formatVnd(data.revenue)} note="Đơn hoàn thành và khách đã thanh toán" badge={`Tháng ${Number(data.month.slice(5))}/${data.month.slice(0, 4)}`}><RevenueFilter month={data.month} /></Metric>
        <Metric label="Workshop sắp diễn ra" value={String(upcoming.length).padStart(2, '0')} note="Buổi đã duyệt · trong 30 ngày tới" badge={`${upcoming.reduce((sum, session) => sum + session.registered, 0)} lượt đăng ký`} href="/partner/workshops" />
        <Metric label="Còn phải thanh toán" value={formatVnd(data.payable)} note="Hệ thống chưa chuyển cho doanh nghiệp" badge={`${data.statementCount} kỳ đã đối soát`} href="/partner/settlements" />
      </div>
      <div className="mt-6 grid auto-rows-fr items-stretch gap-6 lg:grid-cols-2">
        <section className="partner-panel min-w-0 px-5 pb-2 pt-6 sm:px-6">
          <div className="flex items-center justify-between gap-3 border-b border-[#eaf0ec] pb-5"><div><h2 className="text-lg font-medium">Cần xử lý</h2><p className="mt-1 text-xs leading-5 partner-muted">Các việc cần bạn ưu tiên hôm nay</p></div><span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-[#fcf3d9] px-2 text-sm font-semibold text-[#9b7418]">{taskCount}</span></div>
          <ul className="divide-y divide-[#eaf0ec]">
            {pending.length > 0 && <Task icon="bag" tone="amber" title={`${pending.length} đơn hàng mới chờ tiếp nhận`} description={waitedHours < 1 ? 'Đơn cũ nhất đã chờ dưới 1 giờ' : `Đơn cũ nhất đã chờ ${waitedHours} giờ`} href="/partner/orders" action="Xử lý đơn" />}
            {data.rejectedWorkshops.map(workshop => <Task key={workshop.id} icon="alert" tone="red" title="Workshop cần chỉnh sửa" description={`“${workshop.title}” · ${workshop.reject_reason || 'Hồ sơ chưa được duyệt, vui lòng kiểm tra lại.'}`} href="/partner/workshops" action="Xem lý do" />)}
            {data.rejectedProducts.map(product => <Task key={product.id} icon="box" tone="red" title="Sản phẩm cần chỉnh sửa" description={`${product.name} · ${product.reject_reason || 'Vui lòng kiểm tra và gửi duyệt lại.'}`} href={`/partner/products#${product.id}`} action="Xem sản phẩm" />)}
            {upcoming[0] && <Task icon="calendar" title="Buổi tổ chức sắp đến" description={`${datePart(upcoming[0].starts_at, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} · ${upcoming[0].registered}/${upcoming[0].capacity} chỗ đã đăng ký`} href="/partner/workshops" action="Xem chi tiết" />}
          </ul>
          {taskCount === 0 && <div className="py-12 text-center"><span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="check" /></span><p className="text-sm font-medium">Mọi việc đã được xử lý</p><p className="mt-2 text-xs partner-muted">Các đơn hàng và công việc mới sẽ xuất hiện tại đây.</p></div>}
        </section>
        <section className="partner-panel min-w-0 px-5 pb-2 pt-6 sm:px-6">
          <div className="flex items-center justify-between gap-3 border-b border-[#eaf0ec] pb-5"><div><h2 className="text-lg font-medium">Workshop sắp diễn ra</h2><p className="mt-1 text-xs leading-5 partner-muted">Lịch tổ chức trong 30 ngày tới</p></div><Link href="/partner/workshops" className="shrink-0 text-xs font-medium text-[#195c46] hover:underline">Xem tất cả</Link></div>
          <ul className="divide-y divide-[#eaf0ec]">{upcoming.slice(0, 3).map(session => <li key={session.id} className="flex gap-4 py-5">
            <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[#eaf4ee] text-[#195c46]"><span className="text-xl font-semibold">{datePart(session.starts_at, { day: '2-digit' })}</span><span className="mt-0.5 text-[10px] font-medium uppercase">THG {datePart(session.starts_at, { month: 'numeric' })}</span></div>
            <div className="min-w-0 flex-1"><Link href="/partner/workshops" className="text-xs font-semibold leading-5 hover:text-[#195c46] hover:underline">{session.title}</Link><p className="mt-1 text-[11px] leading-5 partner-muted">{datePart(session.starts_at, { hour: '2-digit', minute: '2-digit' })}–{datePart(session.ends_at, { hour: '2-digit', minute: '2-digit' })} · {session.location}</p><div role="progressbar" aria-label={`Số chỗ đăng ký: ${session.title}`} aria-valuenow={session.registered} aria-valuemin={0} aria-valuemax={session.capacity} className="my-2 h-1.5 overflow-hidden rounded-full bg-[#e6ece8]"><div className="h-full rounded-full bg-[#195c46]" style={{ width: `${Math.min(100, session.registered / session.capacity * 100)}%` }} /></div><p className="text-[11px] partner-muted">{session.registered}/{session.capacity} chỗ đã đăng ký</p></div>
          </li>)}</ul>
          {upcoming.length === 0 && <div className="py-12 text-center"><span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="calendar" /></span><p className="text-sm font-medium">Chưa có workshop sắp diễn ra</p><p className="mt-2 text-xs leading-5 partner-muted">Các buổi được duyệt trong 30 ngày tới sẽ hiển thị tại đây.</p><Link href="/partner/workshops/new" className="mt-4 inline-flex text-xs font-semibold text-[#195c46] hover:underline">Tạo workshop mới →</Link></div>}
        </section>
      </div>
      <RecentOrders orders={data.recentOrders} />
      <p className="mt-5 text-xs leading-6 partner-muted">Khoản còn phải thanh toán đã trừ phí hệ thống, hoàn tiền, điều chỉnh và các khoản đã chuyển theo kỳ đối soát được xác nhận. Doanh thu chỉ tính đơn sản phẩm đã hoàn thành và khách đã thanh toán, theo tháng thanh toán, trước hoàn tiền; không gồm vé workshop.</p>
    </>}
    {!approved && data.applications.length > 0 && <section className="partner-panel mt-6 p-6"><h2 className="text-lg font-medium">Lịch sử hồ sơ</h2><ul className="mt-4 divide-y divide-[#eaf0ec]">{data.applications.map(application => <li key={application.id} className="py-3 text-sm"><span className="font-medium">{application.status === 'PENDING' ? 'Chờ duyệt' : application.status === 'APPROVED' ? 'Đã duyệt' : 'Bị từ chối'}</span><span className="ml-3 text-xs partner-muted">{datePart(application.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>{application.reject_reason && <p className="mt-2 text-xs text-red-700">{application.reject_reason}</p>}</li>)}</ul></section>}
  </div>;
}
