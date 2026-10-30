'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Bấm "thanh toán thành công" → gọi server action tạo webhook có chữ ký HMAC (đúng flow xác thực). */
export function MockPayForm({ paymentId, amount, txn, disabled }: { paymentId: string; amount: number; txn: string; disabled: boolean }) {
  const [busy, setBusy] = useState<'ok' | 'fail' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  async function pay(status: 'SUCCESS' | 'FAILED') {
    setBusy(status === 'SUCCESS' ? 'ok' : 'fail');
    setMsg(null);
    const res = await fetch('/api/payments/mock/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, amount, txn, status }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      router.push(`/payment/result?paymentId=${paymentId}`);
      router.refresh();
    } else {
      setMsg(data?.error?.message ?? 'Thất bại');
      setBusy(null);
    }
  }

  if (disabled) {
    return <p className="mt-4 text-sm text-emerald-700">Giao dịch đã được xử lý.</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        disabled={busy !== null}
        onClick={() => pay('SUCCESS')}
        className="w-full rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy === 'ok' ? 'Đang xử lý...' : `Thanh toán thành công (${new Intl.NumberFormat('vi-VN').format(amount)}đ)`}
      </button>
      <button
        disabled={busy !== null}
        onClick={() => pay('FAILED')}
        className="w-full rounded-lg border border-slate-200 py-3 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy === 'fail' ? 'Đang xử lý...' : 'Mô phỏng thất bại'}
      </button>
      {msg && <p className="text-sm text-red-600">{msg}</p>}
    </div>
  );
}
