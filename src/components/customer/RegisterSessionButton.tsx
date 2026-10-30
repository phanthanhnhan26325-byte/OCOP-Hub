'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RegisterSessionButton({ sessionId, enabled }: { sessionId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!enabled) {
    return <span className="text-sm text-slate-400">Không thể đăng ký</span>;
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await fetch('/api/workshops/registrations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.redirectUrl) {
            window.location.href = data.redirectUrl;
          } else if (res.status === 401) {
            router.push(`/login?next=/workshops`);
          } else {
            alert(data?.error?.message ?? 'Đăng ký thất bại');
            router.refresh();
          }
        })
      }
      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {pending ? 'Đang xử lý...' : 'Đăng ký & thanh toán'}
    </button>
  );
}
