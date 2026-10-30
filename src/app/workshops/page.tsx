import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function WorkshopsPage() {
  const supabase = await supabaseServer();
  const { data: workshops } = await supabase
    .from('workshops')
    .select('id, title, slug, description, cover_image, workshop_sessions(id, starts_at, location, fee, remaining_seats, status)')
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-bold">Workshop trải nghiệm sản phẩm OCOP</h1>
      {!workshops || workshops.length === 0 ? (
        <p className="mt-8 text-slate-500">Chưa có workshop nào.</p>
      ) : (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {workshops.map((w) => {
            const open = (w.workshop_sessions ?? []).filter((s) => s.status === 'OPEN');
            return (
              <Link key={w.id} href={`/workshops/${w.slug}`} className="rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md">
                <h2 className="text-lg font-semibold">{w.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{w.description}</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {open.slice(0, 3).map((s) => (
                    <li key={s.id} className="flex justify-between text-slate-600">
                      <span>{formatDate(s.starts_at)} · {s.location}</span>
                      <span className={s.remaining_seats > 0 ? 'text-emerald-700' : 'text-red-600'}>
                        {formatVnd(s.fee)} · {s.remaining_seats > 0 ? `${s.remaining_seats} chỗ` : 'Hết chỗ'}
                      </span>
                    </li>
                  ))}
                  {open.length === 0 && <li className="text-amber-600">Chưa mở đăng ký</li>}
                </ul>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
