import { supabaseServer } from '@/lib/supabase/server';
import { WorkshopSessionPicker } from '@/components/customer/WorkshopSessionPicker';
import Link from 'next/link';
import { CoffeeWorkshopArticle } from '@/components/customer/CoffeeWorkshopArticle';
import { TeaWorkshopArticle } from '@/components/customer/TeaWorkshopArticle';
import { TeaArtisanWorkshopArticle } from '@/components/customer/TeaArtisanWorkshopArticle';

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
    <div className="mx-auto max-w-6xl px-4 py-10">
      {ws.cover_image && (
        <div className="mb-6 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ws.cover_image} alt={ws.title} className="h-64 w-full object-cover" />
        </div>
      )}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
      <p className="text-xs uppercase tracking-wide text-emerald-700">Workshop · {partner?.business_name}</p>
      <h1 className="mt-1 text-3xl font-bold">{ws.title}</h1>
      <p className="mt-3 whitespace-pre-line text-slate-700">{ws.description}</p>
      {ws.experience_content && <section className="mt-6"><h2 className="text-lg font-semibold">Nội dung trải nghiệm</h2><p className="mt-3 whitespace-pre-line text-slate-700">{ws.experience_content}</p></section>}
      <p className="mt-2 text-sm text-slate-500">Địa điểm: {partner?.address ?? '—'} · Liên hệ: {partner?.contact_phone ?? '—'}</p>
      </div>

      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-full">
        <WorkshopSessionPicker sessions={sessions.map((s) => ({ ...s, canRegister: s.status === 'OPEN' && s.remaining_seats > 0 && new Date(s.starts_at) > new Date() }))} />
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2 [&>article]:mt-0">
      {slug === 'tu-hat-en-ly-kham-pha-huong-vi-ca-phe' && <CoffeeWorkshopArticle />}
      {slug === 'nghe-thuat-thuong-tra-viet' && <TeaWorkshopArticle />}
      {slug === 'mot-ngay-lam-nghe-nhan-tra' && <TeaArtisanWorkshopArticle />}
      </div>
      </div>
    </div>
  );
}
