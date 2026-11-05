'use client';

import { useState } from 'react';
import { formatVnd } from '@/lib/money';
import { formatWorkshopTime } from '@/lib/workshop-time';
import { RegisterSessionButton } from './RegisterSessionButton';

interface Session {
  id: string;
  starts_at: string;
  ends_at: string;
  location: string;
  fee: number | string;
  capacity: number;
  remaining_seats: number;
  status: string;
  canRegister: boolean;
}

export function WorkshopSessionPicker({ sessions }: { sessions: Session[] }) {
  const [selectedId, setSelectedId] = useState(sessions.find((s) => s.canRegister)?.id ?? '');
  const selected = sessions.find((s) => s.id === selectedId && s.canRegister);

  return (
    <aside aria-labelledby="workshop-session-heading" className="min-w-0 self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
      <h2 id="workshop-session-heading" className="text-lg font-semibold text-emerald-800">Chọn buổi tham gia</h2>
      <fieldset className="mt-4 space-y-3">
        <legend className="sr-only">Chọn buổi workshop để đăng ký</legend>
        {sessions.map((s) => {
          const [time, date] = formatWorkshopTime(s.starts_at, s.ends_at).split(' · ');
          const active = selected?.id === s.id;
          const status = s.canRegister ? 'Đang nhận đăng ký'
            : s.status === 'CANCELLED' ? 'Đã hủy'
            : s.remaining_seats <= 0 ? 'Hết chỗ' : 'Không thể đăng ký';
          return (
            <label key={s.id} className={`relative block rounded-xl border p-3.5 transition-colors ${!s.canRegister ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400' : active ? 'cursor-pointer border-emerald-800 bg-emerald-50 ring-1 ring-emerald-800' : 'cursor-pointer border-slate-200 hover:border-emerald-400'} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-700`}>
              <input type="radio" name="workshop-session" value={s.id} checked={active} disabled={!s.canRegister} onChange={() => setSelectedId(s.id)} className="sr-only" />
              <span className="flex items-start justify-between gap-3 text-sm font-semibold text-emerald-800">
                <span>{date ?? time}</span>
                <span className="shrink-0">{formatVnd(s.fee)}</span>
              </span>
              <span className="mt-2 grid grid-cols-[minmax(0,1fr)_100px] gap-3 text-xs leading-5 text-slate-500">
                <span>{date ? `${time} · ` : ''}{s.location}</span>
                <span>{status}</span>
              </span>
              <span className="mt-2 block text-xs leading-5 text-slate-500">Sức chứa {s.capacity} · còn {s.remaining_seats} chỗ</span>
            </label>
          );
        })}
        {sessions.length === 0 && <p className="text-sm text-slate-500">Chưa mở đăng ký</p>}
      </fieldset>
      <div className="mt-4 [&>button]:w-full [&>button]:py-3">
        <RegisterSessionButton key={selected?.id ?? 'none'} sessionId={selected?.id ?? ''} enabled={Boolean(selected)} />
      </div>
    </aside>
  );
}
