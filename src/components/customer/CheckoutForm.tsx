'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CheckoutForm() {
  const router = useRouter();
  const [form, setForm] = useState({ receiverName: '', phone: '', address: '', ward: '', district: '', city: '', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    // Idempotency key duy nhất cho lần bấm này — gửi lặp vẫn chỉ tạo 1 đơn
    const idempotencyKey = crypto.randomUUID();
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey, shippingAddress: form }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.redirectUrl) {
      window.location.href = data.redirectUrl;
      return;
    }
    setError(data?.error?.message ?? 'Đặt hàng thất bại');
    setSubmitting(false);
    if (res.status === 409) router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Họ tên người nhận *
          <input required value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-sm">
          Số điện thoại *
          <input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">
        Địa chỉ *
        <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Phường/Xã
          <input value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-sm">
          Quận/Huyện
          <input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
        </label>
        <label className="text-sm">
          Tỉnh/Thành phố
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">
        Ghi chú
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" rows={2} />
      </label>
      <button disabled={submitting} className="w-full rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {submitting ? 'Đang xử lý...' : 'Xác nhận đặt mua & thanh toán'}
      </button>
    </form>
  );
}
