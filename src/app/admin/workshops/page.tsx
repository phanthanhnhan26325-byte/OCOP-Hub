import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface WorkshopSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  created_at: string;
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
  return [...(workshop.workshop_sessions ?? [])]
    .filter((session) => new Date(session.ends_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;
}

export default async function AdminWorkshopsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string | string[]; q?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const partnerId = typeof params.partner === 'string' ? params.partner : null;
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const supabase = await supabaseServer();

  const workshopSelection = 'id, title, slug, status, created_at, partner_id, partner_profiles(business_name), workshop_sessions(starts_at, ends_at, status, remaining_seats, capacity)';
  let workshopsQuery = supabase
    .from('workshops')
    .select(workshopSelection)
    .order('created_at', { ascending: false })
    .limit(200);
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
        .order('created_at', { ascending: false })
        .limit(200);
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
        Theo dõi lịch tổ chức, doanh nghiệp tổ chức, trạng thái và số vé đã bán.
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

      <div className="mt-5 space-y-3">
        {workshops.map((workshop) => {
          const partner = firstRelation(workshop.partner_profiles);
          const session = nextSession(workshop, now);
          return (
            <Link
              key={workshop.id}
              href={`/admin/workshops/${workshop.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-emerald-900">{workshop.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                  {workshopStatusLabel(workshop.status)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                <span>
                  {session
                    ? `Lịch gần nhất: ${formatDate(session.starts_at)} · ${session.remaining_seats}/${session.capacity} chỗ`
                    : 'Chưa có lịch tổ chức sắp tới'}
                </span>
                <span>Tạo: {formatDate(workshop.created_at)}</span>
              </div>
              <p className="mt-3 text-xs font-medium text-emerald-800">Bấm để xem chi tiết →</p>
            </Link>
          );
        })}
        {workshops.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            {query ? 'Không tìm thấy workshop phù hợp.' : 'Chưa có workshop.'}
          </p>
        )}
      </div>
    </div>
  );
}
