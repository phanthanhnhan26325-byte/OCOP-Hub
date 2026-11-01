'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface PaymentRow { id: string; amount: string; refunded_amount: string; purpose: string }

export function RefundForm({ payments }: { payments: PaymentRow[] }) {
  const [paymentId, setPaymentId] = useState('');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [transferReference, setTransferReference] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await fetch('/api/admin/refunds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId, amount, reason, transferReference }),
          });
          const data = await res.json().catch(() => null);
          setMsg(res.ok ? 'Đã ghi nhận hoàn tiền' : data?.error?.message ?? 'Thất bại');
          router.refresh();
        });
      }}
      className="mt-3 grid gap-3 sm:grid-cols-2"
    >
      <label className="text-sm">Giao dịch đã thanh toán
        <select required value={paymentId} onChange={(e) => setPaymentId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">— Chọn —</option>
          {payments.map((p) => (
            <option key={p.id} value={p.id}>
              {p.purpose} · {Number(p.amount).toLocaleString('vi-VN')}đ (đã hoàn {Number(p.refunded_amount).toLocaleString('vi-VN')})
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">Số tiền hoàn
        <input type="number" required min={1} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <label className="text-sm">Mã tham chiếu chuyển khoản
        <input required value={transferReference} onChange={(e) => setTransferReference(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <label className="text-sm">Lý do *
        <input required value={reason} onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <div className="sm:col-span-2">
        <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? 'Đang xử lý...' : 'Ghi nhận hoàn tiền'}
        </button>
        {msg && <span className="ml-3 text-sm text-slate-600">{msg}</span>}
      </div>
    </form>
  );
}
