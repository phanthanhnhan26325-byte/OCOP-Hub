'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SubmitWorkshopButton({ workshopId }: { workshopId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await fetch(`/api/partner/workshops/${workshopId}/submit`, { method: 'POST' });
          router.refresh();
        })
      }
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? '...' : 'Gửi duyệt'}
    </button>
  );
}
