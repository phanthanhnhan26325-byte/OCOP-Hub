'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SyncPaymentsButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await fetch('/api/admin/payments/sync', { method: 'POST' });
          const data = await res.json().catch(() => null);
          alert(res.ok ? `Đã sync: ${JSON.stringify(data)}` : 'Sync thất bại');
          router.refresh();
        })
      }
      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? 'Đang sync...' : 'Sync lại PENDING_SYNC'}
    </button>
  );
}
