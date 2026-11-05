'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

function localDateTimeNow() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function FinanceExpenseForm() {
  const [expenseType, setExpenseType] = useState<'SHIPPING' | 'OPERATING'>('SHIPPING');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [incurredAt, setIncurredAt] = useState(localDateTimeNow);
  const [referenceCode, setReferenceCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm('Xác nhận ghi nhận khoản chi thực tế này vào sổ tài chính?')) return;
        setMessage(null);
        startTransition(async () => {
          try {
            const response = await fetch('/api/admin/finance/expenses', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                expenseType,
                description,
                amount: Number(amount),
                incurredAt: new Date(incurredAt).toISOString(),
                referenceCode: referenceCode || undefined,
              }),
            });
            const data = await response.json().catch(() => null) as { error?: { message?: string } } | null;
            if (!response.ok) {
              setIsError(true);
              setMessage(data?.error?.message ?? 'Không thể ghi nhận chi phí.');
              return;
            }
            setIsError(false);
            setMessage('Đã ghi nhận chi phí thực tế.');
            setDescription('');
            setAmount('');
            setReferenceCode('');
            router.refresh();
          } catch {
            setIsError(true);
            setMessage('Không thể kết nối máy chủ. Vui lòng thử lại.');
          }
        });
      }}
    >
      <label className="text-xs font-medium text-slate-600">
        Loại chi phí
        <select value={expenseType} onChange={(event) => setExpenseType(event.target.value as 'SHIPPING' | 'OPERATING')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="SHIPPING">Vận chuyển thực tế</option>
          <option value="OPERATING">Chi phí vận hành</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Số tiền (VND)
        <input required min={1} step={1} type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Thời điểm phát sinh
        <input required type="datetime-local" value={incurredAt} onChange={(event) => setIncurredAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Mã chứng từ / giao dịch
        <input maxLength={200} value={referenceCode} onChange={(event) => setReferenceCode(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-medium text-slate-600 sm:col-span-2">
        Nội dung / đơn vị cung cấp
        <input required minLength={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      </label>
      <div className="flex items-end">
        <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
          {pending ? 'Đang ghi nhận...' : 'Ghi nhận chi phí'}
        </button>
      </div>
      {message && <p role="status" className={`sm:col-span-2 xl:col-span-6 text-sm ${isError ? 'text-rose-700' : 'text-emerald-700'}`}>{message}</p>}
    </form>
  );
}
