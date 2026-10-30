'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

const transitions: Record<string, { to: string; label: string; variant?: 'primary' | 'danger' }[]> = {
  PENDING_ACCEPTANCE: [
    { to: 'ACCEPTED', label: 'Tiếp nhận đơn' },
    { to: 'REJECTED_BY_PARTNER', label: 'Từ chối', variant: 'danger' },
  ],
  ACCEPTED: [{ to: 'PROCESSING', label: 'Bắt đầu xử lý' }],
  PROCESSING: [{ to: 'SHIPPED', label: 'Đã giao vận' }],
  SHIPPED: [{ to: 'DELIVERED', label: 'Khách đã nhận' }],
  DELIVERED: [{ to: 'COMPLETED', label: 'Hoàn thành' }],
};

export function SubOrderActions({ orderId, status }: { orderId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const router = useRouter();
  const actions = transitions[status] ?? [];
  if (actions.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {status === 'PENDING_ACCEPTANCE' && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lý do từ chối (bắt buộc khi từ chối)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.to}
            disabled={pending || (a.to === 'REJECTED_BY_PARTNER' && reason.trim().length < 3)}
            onClick={() =>
              startTransition(async () => {
                await fetch(`/api/partner/orders/${orderId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ toStatus: a.to, reason }),
                });
                router.refresh();
              })
            }
            className={
              a.variant === 'danger'
                ? 'rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50'
                : 'rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50'
            }
          >
            {pending ? '...' : a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
