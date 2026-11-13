'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderServiceRequest } from '@/modules/orders/order-service-requests';
import { formatVnd } from '@/lib/money';

const terminalStatuses = ['COMPLETED', 'RETURNED', 'CANCELLED', 'REJECTED_BY_PARTNER', 'EXPIRED'];

function refundMessage(request: OrderServiceRequest) {
  if (request.refund_status === 'RESERVED') {
    return 'Khoản thanh toán chưa hoàn tất; hệ thống sẽ đưa yêu cầu hoàn vào hàng chờ nếu giao dịch được xác nhận.';
  }
  if (request.refund_status === 'PENDING') {
    return `Đang chờ bộ phận quản trị xử lý hoàn ${formatVnd(request.refund_amount)} theo quy trình hiện tại. Khoản này chưa được xác nhận là đã chuyển.`;
  }
  if (request.refund_status === 'COMPLETED') return 'Khoản hoàn tiền đã được ghi nhận hoàn tất.';
  if (request.refund_status === 'FAILED') return 'Hoàn tiền chưa thành công. Vui lòng liên hệ bộ phận hỗ trợ.';
  return 'Đơn hàng chưa ghi nhận khoản thanh toán cần hoàn.';
}

export function CustomerOrderActions({
  orderId,
  status,
  phone,
  requests,
}: {
  orderId: string;
  status: string;
  phone: string;
  requests: OrderServiceRequest[];
}) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [reason, setReason] = useState('');
  const [contactPhone, setContactPhone] = useState(phone);
  const [image, setImage] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const latestReturn = [...requests]
    .filter(request => request.request_type === 'RETURN')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const cancellation = requests.find(request => request.request_type === 'CANCELLATION');
  const hasOpenReturn = latestReturn && ['REQUESTED', 'APPROVED', 'RETURN_SENT'].includes(latestReturn.status);
  const canCancel = !terminalStatuses.includes(currentStatus) && currentStatus !== 'DELIVERED';

  async function sendAction(action: 'COMPLETE' | 'CANCEL' | 'RETURN_SENT') {
    if (action === 'CANCEL' && !window.confirm('Bạn có chắc muốn hủy phần đơn này không?')) return;
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${orderId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error?.message ?? 'Không thể cập nhật đơn hàng.');
        if (response.status === 409) router.refresh();
        return;
      }
      if (!data?.ok) {
        setError('Chưa xác nhận được thao tác. Vui lòng tải lại trang.');
        return;
      }
      setCurrentStatus(data.status ?? currentStatus);
      setMessage(action === 'COMPLETE'
        ? 'Bạn đã xác nhận hoàn thành đơn hàng.'
        : action === 'CANCEL'
          ? 'Đơn hàng đã được hủy. Nếu đã thanh toán, khoản hoàn sẽ được đưa vào danh sách chờ xử lý.'
          : 'Đã báo cho doanh nghiệp rằng bạn gửi trả hàng.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể kết nối máy chủ.');
    }
  }

  function submitReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!image) {
      setError('Vui lòng đính kèm ảnh tình trạng sản phẩm.');
      return;
    }
    startTransition(async () => {
      setError(null);
      setMessage(null);
      const formData = new FormData();
      formData.set('reason', reason);
      formData.set('contactPhone', contactPhone);
      formData.set('image', image);
      try {
        const response = await fetch(`/api/orders/${orderId}/return`, { method: 'POST', body: formData });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error?.message ?? 'Không thể gửi yêu cầu trả hàng.');
        if (!data?.ok) throw new Error('Chưa xác nhận được yêu cầu. Vui lòng tải lại trang.');
        setShowReturnForm(false);
        setReason('');
        setImage(null);
        setMessage('Đã gửi yêu cầu trả hàng cho doanh nghiệp.');
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Không thể kết nối máy chủ.');
      }
    });
  }

  if (terminalStatuses.includes(currentStatus) && !cancellation && !latestReturn) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      {cancellation && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Đơn hàng đã hủy</p>
          <p className="mt-1">{refundMessage(cancellation)}</p>
        </div>
      )}

      {latestReturn && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium">
            {latestReturn.status === 'REQUESTED' && 'Đang chờ doanh nghiệp phản hồi yêu cầu trả hàng'}
            {latestReturn.status === 'APPROVED' && 'Doanh nghiệp đã đồng ý nhận trả hàng'}
            {latestReturn.status === 'REJECTED' && 'Doanh nghiệp chưa chấp thuận yêu cầu trả hàng'}
            {latestReturn.status === 'RETURN_SENT' && 'Đang chờ doanh nghiệp xác nhận đã nhận lại hàng'}
            {latestReturn.status === 'RETURN_RECEIVED' && 'Doanh nghiệp đã xác nhận nhận lại hàng'}
          </p>
          <p className="text-slate-600">Lý do: {latestReturn.reason}</p>
          {latestReturn.partner_response && <p className="text-slate-600">Phản hồi doanh nghiệp: {latestReturn.partner_response}</p>}
          {latestReturn.evidence_url && <a href={latestReturn.evidence_url} target="_blank" rel="noreferrer" className="inline-flex text-emerald-800 underline">Xem ảnh đã gửi</a>}
          {latestReturn.status === 'APPROVED' && (
            <button type="button" disabled={pending} onClick={() => startTransition(async () => { await sendAction('RETURN_SENT'); })}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
              {pending ? 'Đang cập nhật...' : 'Tôi đã gửi trả hàng'}
            </button>
          )}
          {latestReturn.status === 'RETURN_RECEIVED' && <p className="text-amber-800">{refundMessage(latestReturn)}</p>}
        </div>
      )}

      {currentStatus === 'DELIVERED' && !hasOpenReturn && !cancellation && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => startTransition(async () => { await sendAction('COMPLETE'); })}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Xác nhận đã nhận hàng thành công
          </button>
          {latestReturn?.status !== 'RETURN_RECEIVED' && (
            <button type="button" disabled={pending} onClick={() => setShowReturnForm(value => !value)}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 disabled:opacity-50">
              Yêu cầu trả hàng / hoàn tiền
            </button>
          )}
        </div>
      )}

      {canCancel && !cancellation && (
        <button type="button" disabled={pending} onClick={() => startTransition(async () => { await sendAction('CANCEL'); })}
          className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">
          Hủy đơn hàng
        </button>
      )}

      {showReturnForm && (
        <form onSubmit={submitReturn} className="space-y-3 rounded-lg border border-amber-200 bg-white p-3">
          <label className="block text-sm">Lý do trả hàng / hoàn tiền *
            <textarea required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" rows={3} />
          </label>
          <label className="block text-sm">Số điện thoại liên hệ *
            <input required type="tel" value={contactPhone} onChange={event => setContactPhone(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
          </label>
          <label className="block text-sm">Ảnh tình trạng sản phẩm (JPG/PNG, tối đa 5 MB) *
            <input required type="file" accept="image/jpeg,image/png" disabled={pending}
              onChange={event => setImage(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </button>
            <button type="button" disabled={pending} onClick={() => setShowReturnForm(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Đóng</button>
          </div>
        </form>
      )}
    </div>
  );
}
