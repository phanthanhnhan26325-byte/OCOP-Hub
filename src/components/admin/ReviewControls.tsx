'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function ReviewControls({ endpoint }: { endpoint: string }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function review(decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && reason.trim().length < 3) {
      setMsg('Cần nhập lý do từ chối');
      return;
    }
    startTransition(async () => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      });
      const data = await res.json().catch(() => null);
      setMsg(res.ok ? (decision === 'APPROVED' ? 'Đã phê duyệt' : 'Đã từ chối') : data?.error?.message ?? 'Thất bại');
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Lý do từ chối (bắt buộc khi từ chối)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button disabled={pending} onClick={() => review('APPROVED')}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? '...' : 'Phê duyệt'}
        </button>
        <button disabled={pending || reason.trim().length < 3} onClick={() => review('REJECTED')}
          className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
          Từ chối
        </button>
      </div>
    </div>
  );
}
