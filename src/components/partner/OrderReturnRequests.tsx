'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { formatVnd } from '@/lib/money';
import type { OrderServiceRequest } from '@/modules/orders/order-service-requests';

const requestStatus: Record<string, string> = {
  REQUESTED: 'Chờ doanh nghiệp phản hồi',
  APPROVED: 'Đã chấp thuận, chờ khách gửi hàng',
  REJECTED: 'Đã từ chối',
  RETURN_SENT: 'Khách đã gửi, chờ xác nhận nhận hàng',
  RETURN_RECEIVED: 'Đã nhận lại hàng',
};

export function OrderReturnRequests({
  orderId,
  requests,
}: {
  orderId: string;
  requests: (OrderServiceRequest & { evidence_url: string | null })[];
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (requests.length === 0) return null;

  function update(requestId: string, action: 'APPROVE' | 'REJECT' | 'RECEIVE_RETURN') {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const response = await fetch(`/api/partner/orders/${orderId}/return`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, action, reason }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          if (response.status === 409) router.refresh();
          throw new Error(data?.error?.message ?? 'Không cập nhật được yêu cầu trả hàng.');
        }
        if (!data?.ok) throw new Error('Chưa xác nhận được thao tác. Vui lòng tải lại trang.');
        setReason('');
        setMessage(action === 'APPROVE'
          ? 'Đã chấp thuận yêu cầu. Chờ khách gửi hàng hoàn.'
          : action === 'REJECT'
            ? 'Đã từ chối yêu cầu trả hàng.'
            : 'Đã xác nhận nhận lại hàng. Khoản hoàn đang chờ xử lý.');
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không thể kết nối máy chủ.');
      }
    });
  }

  return (
    <section className="partner-panel p-5 sm:p-6">
      <h2 className="border-b border-[#eaf0ec] pb-4 text-base font-medium">Yêu cầu trả hàng / hoàn tiền</h2>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      <div className="mt-4 space-y-4">
        {requests.map(request => (
          <article key={request.id} className="rounded-xl border border-[#dce6e1] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{requestStatus[request.status] ?? request.status}</p>
              <time className="text-xs partner-muted">{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(request.created_at))}</time>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6">{request.reason}</p>
            {request.evidence_url && <a href={request.evidence_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex">
              <Image src={request.evidence_url} alt="Ảnh tình trạng hàng khách gửi trả" width={720} height={480} unoptimized className="max-h-64 max-w-full rounded-lg object-contain" />
            </a>}
            {request.contact_phone && <p className="mt-3 text-sm">Số điện thoại liên hệ: <a href={`tel:${request.contact_phone}`} className="font-medium text-[#195c46] underline">{request.contact_phone}</a></p>}
            {request.partner_response && <p className="mt-2 text-sm text-[#526c63]">Phản hồi: {request.partner_response}</p>}
            {request.status === 'REQUESTED' && (
              <div className="mt-4 space-y-3">
                <label className="block text-xs">Lý do phản hồi (bắt buộc khi từ chối)
                  <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={1000} rows={2}
                    className="mt-1 w-full rounded-lg border border-[#dce6e1] px-3 py-2 text-sm" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending} onClick={() => update(request.id, 'APPROVE')}
                    className="rounded-lg bg-[#195c46] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                    Chấp thuận trả hàng
                  </button>
                  <button type="button" disabled={pending || reason.trim().length < 3} onClick={() => update(request.id, 'REJECT')}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50">
                    Từ chối yêu cầu
                  </button>
                </div>
              </div>
            )}
            {request.status === 'RETURN_SENT' && (
              <div className="mt-4">
                <button type="button" disabled={pending} onClick={() => update(request.id, 'RECEIVE_RETURN')}
                  className="rounded-lg bg-[#195c46] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  Xác nhận đã nhận lại hàng
                </button>
              </div>
            )}
            {request.status === 'RETURN_RECEIVED' && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Hàng đã được nhận lại. Khoản hoàn {formatVnd(request.refund_amount)} đang ở trạng thái {request.refund_status === 'PENDING' ? 'chờ xử lý' : request.refund_status === 'COMPLETED' ? 'đã hoàn tất' : 'không cần hoàn'}.
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
