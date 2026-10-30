import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { ReviewControls } from '@/components/admin/ReviewControls';
import { formatDate, formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminWorkshopsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: workshops } = await supabase
    .from('workshops')
    .select('id, title, slug, description, status, created_at, partner_profiles(business_name), workshop_sessions(starts_at, ends_at, location, fee, capacity)')
    .eq('status', 'PENDING')
    .order('created_at');

  return (
    <div>
      <h1 className="text-2xl font-bold">Phê duyệt workshop</h1>
      <div className="mt-6 space-y-4">
        {(workshops ?? []).map((w) => (
          <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold">{w.title}</h3>
            <p className="text-sm text-slate-500">{(w.partner_profiles as unknown as { business_name: string } | null)?.business_name}</p>
            <p className="mt-1 text-sm text-slate-600">{w.description}</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {(w.workshop_sessions ?? []).map((s, i) => (
                <li key={i}>{formatDate(s.starts_at)} → {formatDate(s.ends_at)} · {s.location} · {formatVnd(s.fee)} · sức chứa {s.capacity}</li>
              ))}
            </ul>
            <ReviewControls endpoint={`/api/admin/workshops/${w.id}/review`} />
          </div>
        ))}
        {(!workshops || workshops.length === 0) && <p className="text-slate-500">Không có workshop chờ duyệt.</p>}
      </div>
    </div>
  );
}
