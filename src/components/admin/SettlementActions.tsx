'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface PartnerRow { user_id: string; business_name: string }

export function SettlementActions({ partners, statementId, net, status }: { partners?: PartnerRow[]; statementId?: string; net?: number; status?: string }) {
  const [partnerId, setPartnerId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (statementId) {
    if (status === 'DRAFT') {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!window.confirm('Xác nhận kết quả đối soát này? Kỳ đối soát sẽ được khóa và các khoản recover sẽ được áp dụng.')) return;
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
    return (
      <p className="mt-2 text-xs text-slate-500">
        {net && net > 0
          ? 'Khoản chuyển cần gắn với yêu cầu đối soát đã được duyệt ở danh sách yêu cầu.'
          : 'Đã chuyển đủ.'}
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm(`Tạo kỳ đối soát tháng ${month} cho doanh nghiệp đã chọn? Snapshot sẽ không bị ghi đè khi tạo lại.`)) return;
        startTransition(async () => {
          const [year, monthNumber] = month.split('-').map(Number);
          const periodStart = `${month}-01`;
          const periodEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
          const res = await fetch('/api/admin/settlements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ partnerId, periodStart, periodEnd }),
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
      <label className="text-xs">Tháng đối soát
        <input type="month" required value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 block rounded border border-slate-200 px-2 py-1.5" />
      </label>
      <button disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? '...' : 'Tạo đối soát'}
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </form>
  );
}
