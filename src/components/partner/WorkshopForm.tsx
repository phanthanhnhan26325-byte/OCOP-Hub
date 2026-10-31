'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface SessionRow { startsAt: string; endsAt: string; location: string; fee: number; capacity: number }

export function WorkshopForm() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([
    { startsAt: '', endsAt: '', location: '', fee: 0, capacity: 20 },
  ]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function update(i: number, patch: Partial<SessionRow>) {
    setSessions((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function slugify(t: string) {
    return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          try {
            const res = await fetch('/api/partner/workshops', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                slug: slugify(title),
                description,
                action: 'submit',
                sessions: sessions.map((s) => ({
                  startsAt: new Date(s.startsAt).toISOString(),
                  endsAt: new Date(s.endsAt).toISOString(),
                  location: s.location,
                  fee: s.fee,
                  capacity: s.capacity,
                })),
              }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error?.message ?? 'Gửi workshop thất bại');
            setMsg('Đã gửi workshop thành công. Vui lòng chờ admin phê duyệt.');
            setTitle(''); setDescription('');
            setSessions([{ startsAt: '', endsAt: '', location: '', fee: 0, capacity: 20 }]);
            router.refresh();
          } catch (error) {
            setMsg(error instanceof Error ? error.message : 'Gửi workshop thất bại');
          }
        });
      }}
      className="space-y-3"
    >
      {msg && <p role="status" className="rounded-lg bg-slate-50 p-2 text-sm">{msg}</p>}
      <label className="block text-sm">Tên workshop *
        <input required value={title} onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <label className="block text-sm">Mô tả
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>

      <h3 className="pt-2 text-sm font-semibold">Các buổi tổ chức *</h3>
      {sessions.map((s, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-5">
          <label className="text-xs">Bắt đầu *<input type="datetime-local" required value={s.startsAt} onChange={(e) => update(i, { startsAt: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs">Kết thúc *<input type="datetime-local" required value={s.endsAt} onChange={(e) => update(i, { endsAt: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs">Địa điểm *<input required value={s.location} onChange={(e) => update(i, { location: e.target.value })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs">Phí (VNĐ)<input type="number" min={0} value={s.fee} onChange={(e) => update(i, { fee: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
          <label className="text-xs">Sức chứa *<input type="number" min={1} required value={s.capacity} onChange={(e) => update(i, { capacity: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5" /></label>
        </div>
      ))}
      <button type="button" onClick={() => setSessions([...sessions, { startsAt: '', endsAt: '', location: '', fee: 0, capacity: 20 }])}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
        + Thêm buổi
      </button>
      <div>
        <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? 'Đang gửi...' : 'Gửi workshop chờ phê duyệt'}
        </button>
      </div>
    </form>
  );
}
