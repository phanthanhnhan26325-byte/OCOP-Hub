'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function CancelRegistrationButton({ registrationId }: { registrationId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!confirm('Bạn chắc chắn muốn hủy đăng ký này?')) return;
        startTransition(async () => {
          await fetch(`/api/workshops/registrations?registrationId=${registrationId}`, { method: 'DELETE' });
          router.refresh();
        });
      }}
      className="mt-1 text-xs text-red-600 hover:underline disabled:opacity-50"
    >
      {pending ? 'Đang hủy...' : 'Hủy đăng ký'}
    </button>
  );
}
