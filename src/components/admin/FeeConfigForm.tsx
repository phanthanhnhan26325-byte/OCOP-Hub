'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface PartnerOption {
  user_id: string;
  business_name: string;
}

export function FeeConfigForm({ partners }: { partners: PartnerOption[] }) {
  const [scope, setScope] = useState<'GLOBAL' | 'PARTNER'>('GLOBAL');
  const [partnerId, setPartnerId] = useState('');
  const [type, setType] = useState<'PLATFORM_RATE' | 'SHIPPING'>('PLATFORM_RATE');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const response = await fetch('/api/admin/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          ...(scope === 'PARTNER' ? { partnerId } : {}),
          type,
          value: Number(value),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error?.message ?? 'Không thể cập nhật cấu hình phí');
        return;
      }
      setMessage('Đã lưu cấu hình; cấu hình hiện tại trước đó đã được kết thúc.');
      setValue('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Phạm vi
        <select value={scope} onChange={(event) => setScope(event.target.value as 'GLOBAL' | 'PARTNER')}
          className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2">
          <option value="GLOBAL">Toàn hệ thống</option>
          <option value="PARTNER">Doanh nghiệp cụ thể</option>
        </select>
      </label>
      {scope === 'PARTNER' && (
        <label className="text-sm">Doanh nghiệp
          <select required value={partnerId} onChange={(event) => setPartnerId(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2">
            <option value="">— Chọn —</option>
            {partners.map((partner) => <option key={partner.user_id} value={partner.user_id}>{partner.business_name}</option>)}
          </select>
        </label>
      )}
      <label className="text-sm">Loại phí
        <select value={type} onChange={(event) => setType(event.target.value as 'PLATFORM_RATE' | 'SHIPPING')}
          className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2">
          <option value="PLATFORM_RATE">Phí nền tảng</option>
          <option value="SHIPPING">Phí vận chuyển</option>
        </select>
      </label>
      <label className="text-sm">{type === 'PLATFORM_RATE' ? 'Tỷ lệ (0–1, ví dụ 0.1 = 10%)' : 'Phí cố định (VND)'}
        <input required type="number" step={type === 'PLATFORM_RATE' ? '0.001' : '1'} min="0"
          max={type === 'PLATFORM_RATE' ? '1' : undefined} value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <div className="sm:col-span-2 lg:col-span-4">
        <button disabled={pending} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50">
          {pending ? 'Đang lưu...' : 'Lưu phiên bản phí'}
        </button>
        {message && <span role="status" className="ml-3 text-sm text-slate-600">{message}</span>}
      </div>
    </form>
  );
}
