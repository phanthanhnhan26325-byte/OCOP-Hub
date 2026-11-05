import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { RegisterSessionButton } from '@/components/customer/RegisterSessionButton';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WorkshopDetailPage({ params }: PageProps<'/workshops/[slug]'>) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: ws } = await supabase
    .from('workshops')
    .select('id, title, description, experience_content, cover_image, status, workshop_sessions(id, starts_at, ends_at, location, fee, capacity, remaining_seats, status), partner_profiles(business_name, address, contact_phone)')
    .eq('slug', slug)
    .eq('status', 'APPROVED')
    .single();

  if (!ws) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Không tìm thấy workshop</h1>
        <Link href="/workshops" className="mt-3 inline-block text-emerald-700 hover:underline">← Về danh sách workshop</Link>
      </div>
    );
  }

  const partner = ws.partner_profiles as unknown as { business_name: string; address: string; contact_phone: string } | null;
  const sessions = [...(ws.workshop_sessions ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {ws.cover_image && (
        <div className="mb-6 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ws.cover_image} alt={ws.title} className="h-64 w-full object-cover" />
        </div>
      )}
      <p className="text-xs uppercase tracking-wide text-emerald-700">Workshop · {partner?.business_name}</p>
      <h1 className="mt-1 text-3xl font-bold">{ws.title}</h1>
      <p className="mt-3 whitespace-pre-line text-slate-700">{ws.description}</p>
      {ws.experience_content && <section className="mt-6"><h2 className="text-lg font-semibold">Nội dung trải nghiệm</h2><p className="mt-3 whitespace-pre-line text-slate-700">{ws.experience_content}</p></section>}
      <p className="mt-2 text-sm text-slate-500">Địa điểm: {partner?.address ?? '—'} · Liên hệ: {partner?.contact_phone ?? '—'}</p>

      <h2 className="mt-10 text-xl font-semibold">Chọn buổi tham gia</h2>
      <div className="mt-4 space-y-3">
        {sessions.map((s) => {
          const isFuture = new Date(s.starts_at) > new Date();
          const canRegister = s.status === 'OPEN' && s.remaining_seats > 0 && isFuture;
          return (
            <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{formatDate(s.starts_at)} — {formatDate(s.ends_at)}</p>
                <p className="text-sm text-slate-600">Địa điểm: {s.location}</p>
                <p className="text-sm">
                  <span className="font-semibold text-emerald-700">{formatVnd(s.fee)}</span>
                  <span className="ml-3 text-slate-500">
                    Sức chứa {s.capacity} · còn {s.remaining_seats} chỗ
                  </span>
                </p>
              </div>
              <RegisterSessionButton sessionId={s.id} enabled={canRegister} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
