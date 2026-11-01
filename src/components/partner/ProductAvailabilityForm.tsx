'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ProductAvailabilityFormProps {
  productId: string;
  availableQty: number;
  reservedQty: number;
  supplyStatus: string;
  preOrderEta: string | null;
}

export function ProductAvailabilityForm({
  productId,
  availableQty,
  reservedQty,
  supplyStatus,
  preOrderEta,
}: ProductAvailabilityFormProps) {
  const [quantity, setQuantity] = useState(String(availableQty));
  const [status, setStatus] = useState(supplyStatus);
  const [eta, setEta] = useState(preOrderEta ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuantity = Number(quantity);
    if (!Number.isInteger(nextQuantity) || nextQuantity < reservedQty) {
      setMessage(`Số lượng phải là số nguyên và không nhỏ hơn ${reservedQty} sản phẩm đang giữ.`);
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/partner/products/${productId}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availableQty: nextQuantity,
          supplyStatus: status,
          preOrderEta: eta,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error?.message ?? 'Không thể cập nhật số lượng cung ứng.');
        return;
      }

      setMessage('Đã cập nhật thông tin cung ứng.');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg bg-slate-50 p-3">
      <h4 className="text-sm font-medium">Cập nhật số lượng cung ứng</h4>
      <p className="mt-1 text-xs text-slate-500">
        Admin chỉ theo dõi thông tin doanh nghiệp khai báo. Đang giữ cho đơn hàng: {reservedQty}.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-600">
          Số lượng cung ứng
          <input
            type="number"
            min={reservedQty}
            step={1}
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          Trạng thái cung ứng
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="IN_STOCK">Đang có hàng</option>
            <option value="OUT_OF_STOCK">Hết hàng</option>
            <option value="PRE_ORDER">Nhận đặt trước</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Ngày dự kiến có hàng
          <input
            type="date"
            value={eta}
            onChange={(event) => setEta(event.target.value)}
            disabled={status !== 'PRE_ORDER'}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? 'Đang cập nhật...' : 'Cập nhật số lượng'}
        </button>
        {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
      </div>
    </form>
  );
}
