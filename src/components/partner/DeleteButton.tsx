'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteButton({ url, label, disabledReason }: { url: string; label: string; disabledReason?: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending || Boolean(disabledReason)}
      title={disabledReason}
      aria-label={disabledReason ? `${label}: ${disabledReason}` : label}
      onClick={() => {
        if (disabledReason) return;
        if (!confirm('Xác nhận xóa?')) return;
        startTransition(async () => {
          try {
            const response = await fetch(url, { method: 'DELETE' });
            if (!response.ok) {
              const body = await response.json().catch(() => null);
              alert(body?.error?.message ?? 'Không thể xóa. Vui lòng thử lại.');
              return;
            }
            router.refresh();
          } catch {
            alert('Không thể kết nối máy chủ. Vui lòng thử lại.');
          }
        });
      }}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? '...' : label}
    </button>
  );
}
