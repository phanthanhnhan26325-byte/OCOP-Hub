'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function SubmitProductButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await fetch(`/api/partner/products/${productId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'submit' }),
          });
          router.refresh();
        })
      }
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? '...' : 'Gửi duyệt'}
    </button>
  );
}
