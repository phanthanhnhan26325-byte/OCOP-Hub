import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate } from '@/lib/money';
import { ReviewControls } from '@/components/admin/ReviewControls';

export const dynamic = 'force-dynamic';

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

interface WorkshopSummary {
  id: string;
  title: string;
  slug: string;
  cover_image: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  partner_id: string;
  partner_profiles: { business_name: string } | { business_name: string }[] | null;
  workshop_sessions: {
    starts_at: string;
    ends_at: string;
    status: string;
    remaining_seats: number;
    capacity: number;
  }[] | null;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
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

function nextSession(workshop: WorkshopSummary, now: number) {
  const sessions = (workshop.workshop_sessions ?? [])
    .filter((session) => session.status !== 'CANCELLED')
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return sessions.find((session) => new Date(session.ends_at).getTime() >= now)
    ?? sessions[sessions.length - 1]
    ?? null;
}

function workshopTicketTotals(workshop: WorkshopSummary) {
  const sessions = (workshop.workshop_sessions ?? []).filter(
    (session) => session.status !== 'CANCELLED',
  );
  const capacity = sessions.reduce((total, session) => total + session.capacity, 0);
  const remaining = sessions.reduce((total, session) => total + session.remaining_seats, 0);
  return { capacity, booked: capacity - remaining, remaining };
}

export default async function AdminWorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string | string[]; q?: string | string[]; view?: string | string[]; status?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const partnerId = typeof params.partner === 'string' ? params.partner : null;
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const approvalView = params.view === 'approval';
  const statusFilter =
    params.status === 'PENDING' ||
    params.status === 'APPROVED' ||
    params.status === 'REJECTED'
      ? params.status as ApprovalStatus
      : null;
  const supabase = await supabaseServer();

  const workshopSelection = 'id, title, slug, cover_image, status, created_at, reviewed_at, reject_reason, partner_id, partner_profiles(business_name), workshop_sessions(starts_at, ends_at, status, remaining_seats, capacity)';
  let workshopsQuery = supabase
    .from('workshops')
    .select(workshopSelection)
    .order('created_at', { ascending: false });
  if (approvalView) {
    workshopsQuery = workshopsQuery
      .in('status', statusFilter ? [statusFilter] : ['PENDING', 'APPROVED', 'REJECTED'])
      .limit(10);
  } else {
    workshopsQuery = workshopsQuery.eq('status', 'APPROVED').limit(200);
  }
  if (partnerId) workshopsQuery = workshopsQuery.eq('partner_id', partnerId);
  if (query) workshopsQuery = workshopsQuery.ilike('title', `%${query}%`);

  const { data: workshopData, error } = await workshopsQuery;
  if (error) throw new Error(error.message);

  let workshops = (workshopData ?? []) as unknown as WorkshopSummary[];

  if (query) {
    let partnersQuery = supabase
      .from('partner_profiles')
      .select('user_id')
      .ilike('business_name', `%${query}%`);
    if (partnerId) partnersQuery = partnersQuery.eq('user_id', partnerId);
    const { data: partnerMatches, error: partnerError } = await partnersQuery;
    if (partnerError) throw new Error(partnerError.message);

    const matchingPartnerIds = (partnerMatches ?? []).map((partner) => partner.user_id);
    if (matchingPartnerIds.length > 0) {
      let partnerWorkshopsQuery = supabase
        .from('workshops')
        .select(workshopSelection)
        .in('partner_id', matchingPartnerIds)
        .order('created_at', { ascending: false });
      if (approvalView) {
        partnerWorkshopsQuery = partnerWorkshopsQuery
          .in('status', statusFilter ? [statusFilter] : ['PENDING', 'APPROVED', 'REJECTED'])
          .limit(10);
      } else {
        partnerWorkshopsQuery = partnerWorkshopsQuery.eq('status', 'APPROVED').limit(200);
      }
      if (partnerId) partnerWorkshopsQuery = partnerWorkshopsQuery.eq('partner_id', partnerId);
      const { data: partnerWorkshops, error: partnerWorkshopsError } = await partnerWorkshopsQuery;
      if (partnerWorkshopsError) throw new Error(partnerWorkshopsError.message);

      const merged = new Map(workshops.map((workshop) => [workshop.id, workshop]));
      for (const workshop of (partnerWorkshops ?? []) as unknown as WorkshopSummary[]) {
        merged.set(workshop.id, workshop);
      }
      workshops = [...merged.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
  }

  const now = new Date().getTime();

  if (approvalView) {
    const statusLabels: Record<ApprovalStatus, string> = {
      PENDING: 'Chờ duyệt',
      APPROVED: 'Đã phê duyệt',
      REJECTED: 'Đã từ chối',
    };
    const statusStyles: Record<ApprovalStatus, string> = {
      PENDING: 'bg-amber-50 text-amber-700',
      APPROVED: 'bg-emerald-50 text-emerald-700',
      REJECTED: 'bg-red-50 text-red-700',
    };
    const priority: Record<ApprovalStatus, number> = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
    const approvalWorkshops = workshops
      .filter((workshop) => workshop.status === 'PENDING' || workshop.status === 'APPROVED' || workshop.status === 'REJECTED')
      .sort((a, b) => {
        const statusDifference =
          priority[a.status as ApprovalStatus] - priority[b.status as ApprovalStatus];
        return statusDifference || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 10);
    const filterHref = (status: ApprovalStatus | null) => {
      const search = new URLSearchParams({ view: 'approval' });
      if (status) search.set('status', status);
      if (partnerId) search.set('partner', partnerId);
      if (query) search.set('q', query);
      return `/admin/workshops?${search.toString()}`;
    };

    return (
      <div>
        <h1 className="text-2xl font-bold">Phê duyệt workshop</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tối đa 10 workshop gần nhất. Workshop chờ duyệt được ưu tiên hiển thị trước.
        </p>

        <nav aria-label="Lọc workshop theo trạng thái" className="mt-5 flex flex-wrap gap-2">
          {([
            { label: 'Tất cả', status: null },
            { label: 'Chờ duyệt', status: 'PENDING' },
            { label: 'Đã phê duyệt', status: 'APPROVED' },
            { label: 'Đã từ chối', status: 'REJECTED' },
          ] as const).map(({ label, status }) => {
            const active = statusFilter === status;
            return (
              <Link
                key={label}
                href={filterHref(status)}
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

        <form action="/admin/workshops" method="get" className="mt-5 flex flex-wrap gap-2">
          <input type="hidden" name="view" value="approval" />
          {partnerId && <input type="hidden" name="partner" value={partnerId} />}
          <label className="sr-only" htmlFor="workshop-search">Tìm workshop</label>
          <input
            id="workshop-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Tìm tên workshop hoặc doanh nghiệp"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-lg"
          />
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            Tìm kiếm
          </button>
          {query && (
            <Link
              href={filterHref(statusFilter)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Xóa tìm kiếm
            </Link>
          )}
        </form>

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Workshop / doanh nghiệp</th>
                <th className="px-4 py-3">Lịch gần nhất</th>
                <th className="px-4 py-3">Ngày gửi</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Ngày duyệt</th>
                <th className="px-4 py-3">Lý do từ chối</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {approvalWorkshops.map((workshop) => {
                const partner = firstRelation(workshop.partner_profiles);
                const session = nextSession(workshop, now);
                const status = workshop.status as ApprovalStatus;
                return (
                  <tr key={workshop.id} className="border-b border-slate-50 align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link href={`/admin/workshops/${workshop.id}`} className="font-medium text-emerald-900 hover:underline">
                        {workshop.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {session
                        ? `${formatDate(session.starts_at)} · ${session.remaining_seats}/${session.capacity} chỗ`
                        : 'Chưa có lịch tổ chức sắp tới'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(workshop.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}>
                        {statusLabels[status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {workshop.reviewed_at ? formatDate(workshop.reviewed_at) : '—'}
                    </td>
                    <td className="max-w-56 px-4 py-3 text-slate-600">{workshop.reject_reason || '—'}</td>
                    <td className="px-4 py-3">
                      {status === 'PENDING' ? (
                        <ReviewControls endpoint={`/api/admin/workshops/${workshop.id}/review`} />
                      ) : (
                        <Link href={`/admin/workshops/${workshop.id}`} className="font-medium text-emerald-800 hover:underline">
                          Xem chi tiết
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {approvalWorkshops.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {statusFilter
                      ? `Không có workshop ${statusLabels[statusFilter].toLocaleLowerCase('vi-VN')}.`
                      : query
                        ? 'Không tìm thấy workshop phù hợp.'
                        : 'Chưa có workshop cần phê duyệt hoặc đã được xử lý.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {partnerId && (
        <Link href={`/admin/users/${partnerId}`} className="text-sm font-medium text-emerald-800 hover:underline">
          ← Quay lại hồ sơ đối tác
        </Link>
      )}
      <h1 className={`${partnerId ? 'mt-3 ' : ''}text-2xl font-bold`}>
        {partnerId ? 'Workshop của đối tác' : 'Theo dõi workshop'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Chỉ hiển thị workshop đã được phê duyệt; theo dõi lịch, sức chứa và số vé.
      </p>

      <form action="/admin/workshops" method="get" className="mt-5 flex flex-wrap gap-2">
        {partnerId && <input type="hidden" name="partner" value={partnerId} />}
        <label className="sr-only" htmlFor="workshop-search">Tìm workshop</label>
        <input
          id="workshop-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Tìm tên workshop hoặc doanh nghiệp"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-lg"
        />
        <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          Tìm kiếm
        </button>
        {query && (
          <Link
            href={partnerId ? `/admin/workshops?partner=${partnerId}` : '/admin/workshops'}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Xóa tìm kiếm
          </Link>
        )}
      </form>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3">Ảnh workshop</th>
              <th className="px-4 py-3">Tên workshop</th>
              <th className="px-4 py-3">Số lượng vé</th>
              <th className="px-4 py-3">Vé đã đặt</th>
              <th className="px-4 py-3">Vé còn</th>
              <th className="px-4 py-3">Thời gian tổ chức</th>
              <th className="px-4 py-3">Đơn vị tổ chức</th>
            </tr>
          </thead>
          <tbody>
        {workshops.map((workshop) => {
          const partner = firstRelation(workshop.partner_profiles);
          const session = nextSession(workshop, now);
          const tickets = workshopTicketTotals(workshop);
          return (
            <tr key={workshop.id} className="border-b border-slate-50 align-middle hover:bg-slate-50/70">
              <td className="px-4 py-3">
                <Link
                  href={`/admin/workshops/${workshop.id}`}
                  aria-label={`Xem chi tiết ${workshop.title}`}
                  className="block w-fit"
                >
                  {workshop.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={workshop.cover_image}
                      alt={workshop.title}
                      className="h-14 w-20 rounded-lg border border-slate-100 object-cover"
                    />
                  ) : (
                    <span className="flex h-14 w-20 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                      Chưa có ảnh
                    </span>
                  )}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/admin/workshops/${workshop.id}`}
                  className="font-medium text-emerald-900 hover:underline"
                >
                  {workshop.title}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {workshopStatusLabel(workshop.status)}
                </p>
              </td>
              <td className="px-4 py-3">{tickets.capacity}</td>
              <td className="px-4 py-3">{tickets.booked}</td>
              <td className="px-4 py-3 font-medium">{tickets.remaining}</td>
              <td className="px-4 py-3 text-slate-600">
                {session ? (
                  <>
                    <p>{formatDate(session.starts_at)} – {formatDate(session.ends_at)}</p>
                    {(workshop.workshop_sessions?.filter((item) => item.status !== 'CANCELLED').length ?? 0) > 1 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {workshop.workshop_sessions?.filter((item) => item.status !== 'CANCELLED').length} lịch tổ chức
                      </p>
                    )}
                  </>
                ) : (
                  'Chưa có lịch tổ chức'
                )}
              </td>
              <td className="px-4 py-3 text-slate-600">
                {partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}
              </td>
            </tr>
          );
        })}
        {workshops.length === 0 && (
          <tr>
            <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
              {query
                ? 'Không tìm thấy workshop đã được phê duyệt phù hợp.'
                : 'Chưa có workshop nào được phê duyệt.'}
            </td>
          </tr>
        )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
