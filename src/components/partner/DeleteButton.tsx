'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteButton({ url, label }: { url: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm('Xác nhận xóa?')) return;
        startTransition(async () => {
          await fetch(url, { method: 'DELETE' });
          router.refresh();
        });
      }}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? '...' : label}
    </button>
  );
}
