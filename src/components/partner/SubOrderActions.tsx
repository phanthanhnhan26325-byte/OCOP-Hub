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
};

export function SubOrderActions({ orderId, status }: { orderId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [currentStatus, setCurrentStatus] = useState(status);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const actions = transitions[currentStatus] ?? [];
  if (actions.length === 0 && !message && !error) return null;

  return (
    <div className="mt-3 space-y-2">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {currentStatus === 'PENDING_ACCEPTANCE' && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Lý do từ chối (bắt buộc khi từ chối)"
          aria-label="Lý do từ chối đơn hàng"
          maxLength={2000}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={pending || (a.to === 'REJECTED_BY_PARTNER' && reason.trim().length < 3)}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                setMessage(null);
                try {
                  const response = await fetch(`/api/partner/orders/${orderId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toStatus: a.to, reason }),
                  });
                  const data = await response.json().catch(() => null);
                  if (!response.ok) {
                    if (response.status === 409) router.refresh();
                    throw new Error(data?.error?.message ?? 'Không cập nhật được đơn hàng. Vui lòng thử lại.');
                  }
                  if (!data?.ok || data.status !== a.to) throw new Error('Chưa xác nhận được trạng thái đã lưu. Vui lòng tải lại trang để kiểm tra.');
                  setCurrentStatus(data.status);
                  setReason('');
                  const success: Record<string, string> = {
                    ACCEPTED: 'Đã tiếp nhận đơn hàng.', REJECTED_BY_PARTNER: 'Đã từ chối đơn hàng.',
                    PROCESSING: 'Đơn hàng đang được xử lý.', SHIPPED: 'Đã cập nhật đơn hàng đang giao.',
                    DELIVERED: 'Đã xác nhận khách nhận hàng.',
                  };
                  setMessage(data.warning ?? success[data.status] ?? 'Đã lưu trạng thái đơn hàng.');
                  router.refresh();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'Không thể kết nối máy chủ. Vui lòng thử lại.');
                }
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
