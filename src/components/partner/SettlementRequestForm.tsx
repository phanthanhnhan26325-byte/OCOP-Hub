'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface PayoutAccount {
  bank_name: string;
  account_holder: string;
  account_number: string;
}

function previousMonth() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

export function SettlementRequestForm({ account }: { account: PayoutAccount | null }) {
  const [bankName, setBankName] = useState(account?.bank_name ?? '');
  const [accountHolder, setAccountHolder] = useState(account?.account_holder ?? '');
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '');
  const [month, setMonth] = useState(previousMonth());
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    startTransition(async () => {
      const accountResponse = await fetch('/api/partner/settlements/payout-account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName, accountHolder, accountNumber }),
      });
      const accountResult = await accountResponse.json().catch(() => null);
      if (!accountResponse.ok) {
        setMessage(accountResult?.error?.message ?? 'Không lưu được tài khoản nhận tiền.');
        return;
      }

      const [year, monthNumber] = month.split('-').map(Number);
      const periodStart = `${month}-01`;
      const periodEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
      const response = await fetch('/api/partner/settlements/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd }),
      });
      const result = await response.json().catch(() => null);
      setMessage(response.ok ? 'Đã gửi yêu cầu đối soát. Admin sẽ xem xét và cập nhật trạng thái tại đây.' : result?.error?.message ?? 'Không gửi được yêu cầu.');
      if (response.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
      <h2 className="font-semibold text-slate-900">Yêu cầu đối soát và nhận thanh toán</h2>
      <p className="mt-1 text-xs text-slate-600">
        Chỉ yêu cầu cho tháng đã kết thúc. Hệ thống dùng doanh thu, phí sàn đã ghi nhận trên các đơn, tiền hoàn và điều chỉnh để tính số thực nhận.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Ngân hàng
          <input required maxLength={100} value={bankName} onChange={(event) => setBankName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-600">Tên chủ tài khoản
          <input required maxLength={120} value={accountHolder} onChange={(event) => setAccountHolder(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase" />
        </label>
        <label className="text-xs font-medium text-slate-600">Số tài khoản
          <input required maxLength={34} autoComplete="off" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="text-xs font-medium text-slate-600">Tháng đối soát
          <input type="month" required max={previousMonth()} value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
          {pending ? 'Đang gửi…' : 'Gửi yêu cầu đối soát'}
        </button>
        <p aria-live="polite" className="text-sm text-slate-600">{message}</p>
      </div>
    </form>
  );
}
