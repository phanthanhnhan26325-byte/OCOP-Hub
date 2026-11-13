'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate, formatVnd } from '@/lib/money';

interface PendingOrderRefund {
  id: string;
  orderCode: string;
  partnerName: string;
  requestType: 'CANCELLATION' | 'RETURN';
  reason: string;
  refundAmount: number | string;
  paymentStatus: string;
  syncStatus: string;
  createdAt: string;
}

export function OrderServiceRefundQueue({ requests }: { requests: PendingOrderRefund[] }) {
  const [references, setReferences] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function recordRefund(requestId: string) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      try {
        const response = await fetch('/api/admin/refunds/order-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, transferReference: references[requestId] ?? '' }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error?.message ?? 'Không ghi nhận được hoàn tiền.');
        if (!data?.ok) throw new Error('Chưa xác nhận được giao dịch hoàn tiền.');
        setMessage(`Đã ghi nhận hoàn tiền cho đơn ${requests.find(request => request.id === requestId)?.orderCode ?? ''}.`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không thể kết nối máy chủ.');
      }
    });
  }

  return (
    <section className="mt-8 rounded-xl border border-amber-200 bg-white p-5">
      <h2 className="font-semibold">Yêu cầu hoàn tiền chờ xử lý</h2>
      <p className="mt-1 text-sm text-slate-600">Chỉ ghi nhận sau khi đã chuyển tiền ngoài hệ thống. Hiện tại nền tảng chưa tự động hoàn tiền qua cổng thanh toán.</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      <div className="mt-4 space-y-3">
        {requests.map(request => {
          const canRecord = ['PAID', 'PARTIALLY_REFUNDED'].includes(request.paymentStatus) && request.syncStatus === 'SYNCED';
          return (
            <article key={request.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <p className="font-medium">{request.orderCode} · {request.partnerName} · {request.requestType === 'RETURN' ? 'Trả hàng' : 'Hủy đơn'}</p>
                <p className="font-semibold text-amber-800">{formatVnd(request.refundAmount)}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">{request.reason}</p>
              <p className="mt-1 text-xs text-slate-500">Thanh toán: {request.paymentStatus} · Đối soát: {request.syncStatus} · {formatDate(request.createdAt)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={references[request.id] ?? ''} onChange={event => setReferences(value => ({ ...value, [request.id]: event.target.value }))}
                  placeholder="Mã tham chiếu chuyển khoản" maxLength={200} disabled={!canRecord || pending}
                  className="min-w-60 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <button type="button" disabled={!canRecord || pending || (references[request.id] ?? '').trim().length < 3}
                  onClick={() => recordRefund(request.id)}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {pending ? 'Đang ghi nhận...' : 'Đã chuyển tiền, ghi nhận'}
                </button>
              </div>
              {!canRecord && <p className="mt-2 text-xs text-amber-800">Chỉ có thể ghi nhận khi thanh toán đã thành công và được đối soát.</p>}
            </article>
          );
        })}
        {requests.length === 0 && <p className="text-sm text-slate-500">Không có yêu cầu hoàn tiền đang chờ.</p>}
      </div>
    </section>
  );
}
