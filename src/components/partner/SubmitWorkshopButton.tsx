'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SubmitWorkshopButton({ workshopId }: { workshopId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const response = await fetch(`/api/partner/workshops/${workshopId}/submit`, { method: 'POST' });
              const data = await response.json().catch(() => null);
              if (!response.ok) throw new Error(data?.error?.message ?? 'Không thể gửi workshop để phê duyệt');
              setMessage('Đã gửi workshop để admin phê duyệt.');
              router.refresh();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Không thể gửi workshop để phê duyệt');
            }
          })
        }
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {pending ? '...' : 'Gửi duyệt'}
      </button>
      {message && <p role="status" className="mt-1 max-w-48 text-xs text-slate-600">{message}</p>}
    </div>
  );
}
