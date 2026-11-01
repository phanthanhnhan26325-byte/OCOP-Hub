'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function WorkshopSessionControls({
  sessionId,
  status,
  workshopStatus,
}: {
  sessionId: string;
  status: string;
  workshopStatus: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const canChange = ['SCHEDULED', 'OPEN', 'CLOSED'].includes(status);
  const nextStatus = status === 'OPEN' ? 'CLOSED' : 'OPEN';
  const disabled = pending || !canChange || (nextStatus === 'OPEN' && workshopStatus !== 'APPROVED');

  function changeStatus() {
    startTransition(async () => {
      const response = await fetch(`/api/admin/workshops/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error?.message ?? 'Không thể cập nhật lịch workshop');
        return;
      }
      setMessage(nextStatus === 'OPEN' ? 'Đã mở đăng ký.' : 'Đã đóng đăng ký mới.');
      router.refresh();
    });
  }

  if (!canChange) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-2">
      <button type="button" disabled={disabled} onClick={changeStatus}
        className="rounded border border-emerald-700 px-2 py-1 text-[11px] text-emerald-800 disabled:opacity-40">
        {pending ? 'Đang lưu...' : nextStatus === 'OPEN' ? 'Mở đăng ký' : 'Đóng đăng ký'}
      </button>
      {message && <span role="status" className="text-[11px] text-slate-500">{message}</span>}
    </span>
  );
}
