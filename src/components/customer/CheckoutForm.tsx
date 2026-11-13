'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCommunesForProvince, getVietnameseAddressNames, vietnameseProvinces } from '@/modules/orders/vietnam-address';

export interface CheckoutAddressValues {
  receiverName: string;
  phone: string;
  address: string;
  provinceCode: string;
  communeCode: string;
  note: string;
}

interface CheckoutFormProps {
  selectedCartItemIds: string[];
  initialAddress: CheckoutAddressValues;
}

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2';

export function CheckoutForm({ selectedCartItemIds, initialAddress }: CheckoutFormProps) {
  const router = useRouter();
  const [form, setForm] = useState(initialAddress);
  const [editing, setEditing] = useState(!(
    initialAddress.receiverName
    && initialAddress.phone
    && initialAddress.address
    && initialAddress.provinceCode
    && initialAddress.communeCode
  ));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const communes = useMemo(() => getCommunesForProvince(form.provinceCode), [form.provinceCode]);
  const selectedAddress = getVietnameseAddressNames(form.provinceCode, form.communeCode);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          shippingAddress: form,
          selectedCartItemIds,
        }),
      });
      const result = await response.json();
      if (response.ok && result?.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setError(result?.error?.message ?? 'Đặt hàng thất bại.');
      if (response.status === 409) router.refresh();
    } catch {
      setError('Không thể kết nối để đặt hàng. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!editing ? (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Thông tin giao hàng đã lưu</h2>
              <p className="mt-1 text-sm text-slate-600">{form.receiverName} · {form.phone}</p>
              <p className="text-sm text-slate-600">
                {form.address}, {selectedAddress?.commune}, {selectedAddress?.province}
              </p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-sm font-medium text-emerald-700 hover:underline">
              Sửa thông tin
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Họ tên người nhận *
              <input required minLength={2} maxLength={100} value={form.receiverName}
                onChange={event => setForm({ ...form, receiverName: event.target.value })} className={fieldClass} />
            </label>
            <label className="text-sm">
              Số điện thoại *
              <input required type="tel" autoComplete="tel" maxLength={30} value={form.phone}
                onChange={event => setForm({ ...form, phone: event.target.value })} className={fieldClass} />
              <span className="mt-1 block text-xs text-slate-500">
                Số liên hệ để doanh nghiệp giao hàng; cần nhập số di động Việt Nam hợp lệ.
              </span>
            </label>
          </div>

          <label className="block text-sm">
            Địa chỉ nhà, số nhà, thôn/tổ *
            <input required minLength={3} maxLength={300} value={form.address}
              onChange={event => setForm({ ...form, address: event.target.value })} className={fieldClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Tỉnh/Thành phố *
              <select required value={form.provinceCode}
                onChange={event => setForm({ ...form, provinceCode: event.target.value, communeCode: '' })}
                className={fieldClass}>
                <option value="">Chọn tỉnh/thành phố</option>
                {vietnameseProvinces.map(province => (
                  <option key={province.code} value={province.code}>{province.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Xã/Phường/Đặc khu *
              <select required value={form.communeCode} disabled={!form.provinceCode}
                onChange={event => setForm({ ...form, communeCode: event.target.value })} className={fieldClass}>
                <option value="">Chọn xã/phường</option>
                {communes.map(commune => (
                  <option key={commune.code} value={commune.code}>{commune.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Ghi chú giao hàng
            <textarea maxLength={500} value={form.note}
              onChange={event => setForm({ ...form, note: event.target.value })} className={fieldClass} rows={2} />
          </label>
        </>
      )}

      <button disabled={submitting}
        className="w-full rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {submitting ? 'Đang xử lý...' : 'Xác nhận đặt mua & thanh toán'}
      </button>
    </form>
  );
}
