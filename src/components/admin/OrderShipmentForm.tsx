'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

function toLocalDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function OrderShipmentForm({
  orderId,
  initial,
}: {
  orderId: string;
  initial: {
    carrier_name: string;
    tracking_number: string;
    handed_over_at: string | null;
    delivered_at: string | null;
  } | null;
}) {
  const [carrierName, setCarrierName] = useState(initial?.carrier_name ?? '');
  const [trackingNumber, setTrackingNumber] = useState(initial?.tracking_number ?? '');
  const [handedOverAt, setHandedOverAt] = useState(toLocalDateTime(initial?.handed_over_at ?? null));
  const [deliveredAt, setDeliveredAt] = useState(toLocalDateTime(initial?.delivered_at ?? null));
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm('Lưu thông tin vận chuyển cho phần đơn của doanh nghiệp này?')) return;
        setMessage(null);
        startTransition(async () => {
          try {
            const response = await fetch(`/api/admin/orders/${orderId}/shipment`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                carrierName,
                trackingNumber,
                handedOverAt: handedOverAt ? new Date(handedOverAt).toISOString() : null,
                deliveredAt: deliveredAt ? new Date(deliveredAt).toISOString() : null,
              }),
            });
            const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
            if (!response.ok) {
              setIsError(true);
              setMessage(data?.error?.message || 'Không thể cập nhật thông tin vận chuyển.');
              return;
            }
            setIsError(false);
            setMessage('Đã lưu thông tin vận chuyển.');
            router.refresh();
          } catch {
            setIsError(true);
            setMessage('Không thể kết nối máy chủ. Vui lòng thử lại.');
          }
        });
      }}
    >
      <label className="text-xs font-medium text-slate-600">
        Đơn vị vận chuyển
        <input required minLength={2} maxLength={200} value={carrierName} onChange={(event) => setCarrierName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Mã vận đơn
        <input required minLength={2} maxLength={200} value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Ngày bàn giao
        <input type="datetime-local" value={handedOverAt} onChange={(event) => setHandedOverAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Thời gian giao hàng
        <input type="datetime-local" value={deliveredAt} onChange={(event) => setDeliveredAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" />
      </label>
      <div className="sm:col-span-2">
        <button disabled={pending} className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
          {pending ? 'Đang lưu...' : 'Lưu vận chuyển'}
        </button>
        {message && <p role="status" className={`mt-2 text-sm ${isError ? 'text-red-700' : 'text-emerald-700'}`}>{message}</p>}
      </div>
    </form>
  );
}
