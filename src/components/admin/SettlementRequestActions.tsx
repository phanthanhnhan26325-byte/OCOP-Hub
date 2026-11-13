'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatVnd } from '@/lib/money';

export interface SettlementRequestRow {
  id: string;
  status: string;
  requested_at: string;
  requested_amount: number | string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  rejection_reason: string | null;
  proof_url: string | null;
  transfer_reference: string | null;
  statement: {
    period_start: string;
    period_end: string;
    gross_amount: number | string;
    refund_amount: number | string;
    platform_fee: number | string;
    adjustments: number | string;
    net_payable: number | string;
  } | null;
  business_name: string;
}

export function SettlementRequestActions({ requests }: { requests: SettlementRequestRow[] }) {
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [refById, setRefById] = useState<Record<string, string>>({});
  const [fileById, setFileById] = useState<Record<string, File | null>>({});
  const [messageById, setMessageById] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function review(id: string, decision: 'APPROVE' | 'REJECT') {
    const reason = reasonById[id]?.trim() ?? '';
    if (decision === 'REJECT' && reason.length < 3) {
      setMessageById((messages) => ({ ...messages, [id]: 'Nhập lý do từ chối (ít nhất 3 ký tự).' }));
      return;
    }
    startTransition(async () => {
      const response = await fetch(`/api/admin/settlement-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'REJECT' ? { decision, reason } : { decision }),
      });
      const result = await response.json().catch(() => null);
      setMessageById((messages) => ({ ...messages, [id]: response.ok ? 'Đã cập nhật trạng thái.' : result?.error?.message ?? 'Không cập nhật được.' }));
      if (response.ok) router.refresh();
    });
  }

  function recordPayout(id: string, amount: number) {
    const ref = refById[id]?.trim() ?? '';
    const proof = fileById[id];
    if (ref.length < 3 || !proof) {
      setMessageById((messages) => ({ ...messages, [id]: 'Nhập mã giao dịch và đính kèm chứng từ chuyển khoản.' }));
      return;
    }
    if (!window.confirm(`Xác nhận đã chuyển ${formatVnd(amount)} và tải chứng từ? Hệ thống sẽ ghi nhận kỳ này đã đối soát.`)) return;
    startTransition(async () => {
      const form = new FormData();
      form.set('transferReference', ref);
      form.set('proof', proof);
      const response = await fetch(`/api/admin/settlement-requests/${id}/payout`, { method: 'POST', body: form });
      const result = await response.json().catch(() => null);
      setMessageById((messages) => ({ ...messages, [id]: response.ok ? 'Đã ghi nhận chuyển khoản và đối soát.' : result?.error?.message ?? 'Không ghi nhận được khoản chuyển.' }));
      if (response.ok) router.refresh();
    });
  }

  if (requests.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">Chưa có yêu cầu đối soát.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {requests.map((request) => {
        const statement = request.statement;
        const isPending = request.status === 'REQUESTED';
        const isApproved = request.status === 'APPROVED';
        return (
          <article key={request.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="font-semibold">{request.business_name} · {statement?.period_start} → {statement?.period_end}</h3>
                <p className="mt-1 text-xs text-slate-500">Gửi lúc {new Date(request.requested_at).toLocaleString('vi-VN')} · Yêu cầu nhận {formatVnd(request.requested_amount)}</p>
              </div>
              <span className={`h-fit rounded-full px-2.5 py-1 text-xs ${request.status === 'REJECTED' ? 'bg-red-50 text-red-700' : request.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {request.status === 'REQUESTED' ? 'Chờ duyệt' : request.status === 'APPROVED' ? 'Đã duyệt · chờ chuyển' : request.status === 'PAID' ? 'Đã đối soát' : 'Từ chối'}
              </span>
            </div>
            <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
              <p>Doanh thu: {formatVnd(statement?.gross_amount ?? 0)}</p>
              <p>Hoàn tiền: {formatVnd(statement?.refund_amount ?? 0)}</p>
              <p>Phí sàn đã ghi nhận: {formatVnd(statement?.platform_fee ?? 0)}</p>
              <p>Thực nhận: <b className="text-slate-900">{formatVnd(request.requested_amount)}</b></p>
            </div>
            <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">
              Tài khoản nhận: {request.bank_name} · {request.account_holder} · <span className="font-mono">{request.account_number}</span>
            </p>
            {request.rejection_reason && <p className="mt-2 text-sm text-red-700">Lý do từ chối: {request.rejection_reason}</p>}
            {request.transfer_reference && <p className="mt-2 text-sm text-slate-600">Mã giao dịch: {request.transfer_reference}</p>}
            {request.proof_url && <a href={request.proof_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-emerald-800 underline">Mở chứng từ chuyển khoản</a>}
            {isPending && (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                <label className="text-xs text-slate-600">Lý do từ chối (nếu từ chối)
                  <input value={reasonById[request.id] ?? ''} onChange={(event) => setReasonById((values) => ({ ...values, [request.id]: event.target.value }))} className="mt-1 block w-72 rounded border border-slate-200 px-2 py-1.5" />
                </label>
                <button type="button" disabled={pending} onClick={() => review(request.id, 'APPROVE')} className="rounded bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Duyệt yêu cầu</button>
                <button type="button" disabled={pending} onClick={() => review(request.id, 'REJECT')} className="rounded bg-red-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Từ chối</button>
              </div>
            )}
            {isApproved && (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                <label className="text-xs text-slate-600">Mã giao dịch ngân hàng
                  <input required value={refById[request.id] ?? ''} onChange={(event) => setRefById((values) => ({ ...values, [request.id]: event.target.value }))} className="mt-1 block w-56 rounded border border-slate-200 px-2 py-1.5" />
                </label>
                <label className="text-xs text-slate-600">Chứng từ (PDF/JPG/PNG, tối đa 5 MB)
                  <input required type="file" accept="image/jpeg,image/png,application/pdf" onChange={(event) => setFileById((values) => ({ ...values, [request.id]: event.target.files?.[0] ?? null }))} className="mt-1 block max-w-64 text-xs" />
                </label>
                <button type="button" disabled={pending} onClick={() => recordPayout(request.id, Number(request.requested_amount))} className="rounded bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Ghi nhận đã chuyển</button>
              </div>
            )}
            {messageById[request.id] && <p aria-live="polite" className="mt-2 text-xs text-slate-600">{messageById[request.id]}</p>}
          </article>
        );
      })}
    </div>
  );
}
