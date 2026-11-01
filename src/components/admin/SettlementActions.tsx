'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface PartnerRow { user_id: string; business_name: string }

export function SettlementActions({ partners, statementId, net, status }: { partners?: PartnerRow[]; statementId?: string; net?: number; status?: string }) {
  const [partnerId, setPartnerId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [amount, setAmount] = useState(0);
  const [refNo, setRefNo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (statementId) {
    if (status === 'DRAFT') {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await fetch(`/api/admin/settlements/${statementId}/confirm`, { method: 'POST' });
              const data = await res.json().catch(() => null);
              setMsg(res.ok ? 'Đã xác nhận đối soát' : data?.error?.message ?? 'Thất bại');
              router.refresh();
            });
          }}
          className="mt-3"
        >
          <button disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
            {pending ? '...' : 'Xác nhận đối soát'}
          </button>
          {msg && <span className="ml-2 text-xs text-slate-600">{msg}</span>}
        </form>
      );
    }
    if (status !== 'CONFIRMED' && status !== 'PAID') {
      return <p className="mt-2 text-xs text-slate-400">Kỳ đối soát chưa sẵn sàng thanh toán.</p>;
    }
    if (!net || net <= 0) return <p className="mt-2 text-xs text-slate-400">Đã chuyển đủ.</p>;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await fetch(`/api/admin/settlements/${statementId}/payout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount, refNo }),
            });
            const data = await res.json().catch(() => null);
            setMsg(res.ok ? 'Đã ghi nhận chuyển tiền' : data?.error?.message ?? 'Thất bại');
            router.refresh();
          });
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="text-xs">Số tiền chuyển
          <input type="number" required min={1} max={net} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 block w-40 rounded border border-slate-200 px-2 py-1.5" />
        </label>
        <label className="text-xs">Số tham chiếu (VD: FTxxxx)
          <input required value={refNo} onChange={(e) => setRefNo(e.target.value)}
            className="mt-1 block w-48 rounded border border-slate-200 px-2 py-1.5" />
        </label>
        <button disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? '...' : 'Ghi nhận payout'}
        </button>
        {msg && <span className="text-xs text-slate-600">{msg}</span>}
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await fetch('/api/admin/settlements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId, periodStart: start, periodEnd: end }),
          });
          const data = await res.json().catch(() => null);
          setMsg(res.ok ? 'Đã tạo/nhận statement' : data?.error?.message ?? 'Thất bại');
          router.refresh();
        });
      }}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <label className="text-xs">Doanh nghiệp
        <select required value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="mt-1 block rounded border border-slate-200 px-2 py-1.5">
          <option value="">— Chọn —</option>
          {(partners ?? []).map((p) => <option key={p.user_id} value={p.user_id}>{p.business_name}</option>)}
        </select>
      </label>
      <label className="text-xs">Từ ngày
        <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 block rounded border border-slate-200 px-2 py-1.5" />
      </label>
      <label className="text-xs">Đến ngày
        <input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 block rounded border border-slate-200 px-2 py-1.5" />
      </label>
      <button disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? '...' : 'Tạo đối soát'}
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </form>
  );
}
