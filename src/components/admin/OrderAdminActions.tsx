'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface OrderPayment {
  id: string;
  amount: number | string;
  refunded_amount: number | string;
  status: string;
  purpose: string;
}

function messageFrom(data: { error?: { message?: string } } | null, fallback: string) {
  return data?.error?.message || fallback;
}

export function OrderAdminActions({
  orderId,
  orderStatus,
  payments,
}: {
  orderId: string;
  orderStatus: string;
  payments: OrderPayment[];
}) {
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSource, setCancelSource] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnSource, setReturnSource] = useState('');
  const [returnAmount, setReturnAmount] = useState('');
  const [returnReference, setReturnReference] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const pendingPayments = payments.filter(
    (payment) => payment.purpose === 'ORDER' && ['CREATED', 'PENDING'].includes(payment.status),
  );
  const refundablePayments = payments.filter(
    (payment) => payment.purpose === 'ORDER' && ['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status),
  );
  const returnPayment = refundablePayments[0] ?? null;
  const returnableAmount = returnPayment
    ? Math.max(0, Number(returnPayment.amount) - Number(returnPayment.refunded_amount))
    : 0;
  const canCancel = ['CREATED', 'PAYMENT_PENDING'].includes(orderStatus);
  const canReturn = ['DELIVERED', 'COMPLETED', 'PARTIALLY_REFUNDED'].includes(orderStatus);

  async function submit(
    endpoint: string,
    body: Record<string, string | number | null>,
    confirmation: string,
    success: string,
  ) {
    if (!window.confirm(confirmation)) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        if (!response.ok) {
          setErrorMessage(messageFrom(data, 'Không thể hoàn tất thao tác.'));
          return;
        }
        setSuccessMessage(success);
        router.refresh();
      } catch {
        setErrorMessage('Không thể kết nối máy chủ. Vui lòng thử lại.');
      }
    });
  }

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-3">
      {pendingPayments.length > 0 && (
        <form
          className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!paymentId || !amount) return;
            void submit(
              `/api/admin/orders/${orderId}/payment`,
              { paymentId, amount: Number(amount), transferReference },
              'Bạn đã đối chiếu giao dịch chuyển khoản thực tế và muốn xác nhận thanh toán cho đơn hàng này?',
              'Đã xác nhận thanh toán chuyển khoản.',
            );
          }}
        >
          <h2 className="font-semibold">Xác nhận chuyển khoản</h2>
          <p className="mt-1 text-xs text-slate-600">Chỉ xác nhận sau khi đã kiểm tra giao dịch thực tế.</p>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Giao dịch chờ xác nhận
            <select
              required
              value={paymentId}
              onChange={(event) => {
                const selected = pendingPayments.find((payment) => payment.id === event.target.value);
                setPaymentId(event.target.value);
                setAmount(selected ? String(Number(selected.amount)) : '');
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Chọn giao dịch</option>
              {pendingPayments.map((payment) => (
                <option key={payment.id} value={payment.id}>
                  {payment.status} · {Number(payment.amount).toLocaleString('vi-VN')} đ
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Số tiền đã nhận
            <input
              required
              min={1}
              step={1}
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Mã giao dịch ngân hàng
            <input
              required
              minLength={3}
              maxLength={200}
              value={transferReference}
              onChange={(event) => setTransferReference(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <button disabled={pending || !paymentId} className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? 'Đang xử lý...' : 'Xác nhận đã nhận tiền'}
          </button>
        </form>
      )}

      {canCancel && (
        <form
          className="rounded-xl border border-red-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(
              `/api/admin/orders/${orderId}/cancel`,
              { reason: cancelReason, receivedVia: cancelSource || null },
              'Xác nhận hủy đơn chưa thanh toán? Hàng đang giữ chỗ sẽ được trả lại kho.',
              'Đã xử lý yêu cầu hủy đơn và giải phóng số lượng giữ chỗ.',
            );
          }}
        >
          <h2 className="font-semibold">Xử lý yêu cầu hủy</h2>
          <p className="mt-1 text-xs text-slate-600">Chỉ áp dụng khi đơn chưa thanh toán và doanh nghiệp chưa tiếp nhận.</p>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Kênh nhận yêu cầu
            <input
              value={cancelSource}
              onChange={(event) => setCancelSource(event.target.value)}
              maxLength={100}
              placeholder="Điện thoại, email..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Lý do hủy
            <textarea
              required
              minLength={3}
              maxLength={1000}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <button disabled={pending} className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
            {pending ? 'Đang xử lý...' : 'Xác nhận hủy đơn'}
          </button>
        </form>
      )}

      {canReturn && refundablePayments.length > 0 && (
        <form
          className="rounded-xl border border-rose-200 bg-rose-50/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!returnAmount) return;
            void submit(
              `/api/admin/orders/${orderId}/returns`,
              {
                amount: Number(returnAmount),
                reason: returnReason,
                receivedVia: returnSource || null,
                transferReference: returnReference,
              },
              'Xác nhận đã chuyển khoản hoàn tiền thực tế và ghi nhận yêu cầu trả hàng?',
              'Đã ghi nhận yêu cầu trả hàng và khoản hoàn tiền.',
            );
          }}
        >
          <h2 className="font-semibold">Trả hàng / hoàn tiền</h2>
          <p className="mt-1 text-xs text-slate-600">Thực hiện chuyển khoản hoàn tiền trước khi ghi nhận.</p>
          <p className="mt-3 text-xs text-slate-600">
            Còn có thể hoàn: {returnableAmount.toLocaleString('vi-VN')} đ · {returnPayment?.status}
          </p>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Số tiền hoàn
            <input
              required
              min={1}
              max={returnableAmount}
              step={1}
              type="number"
              value={returnAmount || (returnableAmount > 0 ? String(returnableAmount) : '')}
              onChange={(event) => setReturnAmount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Mã tham chiếu chuyển khoản hoàn
            <input
              required
              minLength={3}
              maxLength={200}
              value={returnReference}
              onChange={(event) => setReturnReference(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Kênh nhận yêu cầu / lý do
            <input
              value={returnSource}
              onChange={(event) => setReturnSource(event.target.value)}
              maxLength={100}
              placeholder="Kênh nhận yêu cầu"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-slate-600">
            Ghi chú xử lý
            <textarea
              required
              minLength={3}
              maxLength={1000}
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <button disabled={pending} className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? 'Đang xử lý...' : 'Ghi nhận trả hàng / hoàn tiền'}
          </button>
        </form>
      )}

      {(errorMessage || successMessage) && (
        <p role="status" className={`rounded-lg p-3 text-sm xl:col-span-3 ${errorMessage ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {errorMessage ?? successMessage}
        </p>
      )}
    </section>
  );
}
