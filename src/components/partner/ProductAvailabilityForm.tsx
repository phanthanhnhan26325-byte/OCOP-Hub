'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface VariantAvailabilityInput {
  id: string;
  label: string;
  available_qty: number;
  supply_status: string;
  pre_order_eta: string | null;
}

interface ProductAvailabilityFormProps {
  productId: string;
  variants?: VariantAvailabilityInput[];
  availableQty: number;
  reservedQty: number;
  supplyStatus: string;
  preOrderEta: string | null;
}

interface VariantRow {
  id: string;
  label: string;
  quantity: string;
  status: string;
  eta: string;
}

const statusOptions = [
  { value: 'IN_STOCK', label: 'Đang có hàng' },
  { value: 'OUT_OF_STOCK', label: 'Hết hàng' },
  { value: 'PRE_ORDER', label: 'Nhận đặt trước' },
];

export function ProductAvailabilityForm({
  productId,
  variants,
  availableQty,
  reservedQty,
  supplyStatus,
  preOrderEta,
}: ProductAvailabilityFormProps) {
  const hasVariants = Boolean(variants && variants.length > 0);
  const [quantity, setQuantity] = useState(supplyStatus === 'OUT_OF_STOCK' ? '0' : String(availableQty));
  const [status, setStatus] = useState(supplyStatus);
  const [eta, setEta] = useState(preOrderEta ?? '');
  const [rows, setRows] = useState<VariantRow[]>(() => (variants ?? []).map((variant) => ({
    id: variant.id,
    label: variant.label,
    quantity: variant.supply_status === 'OUT_OF_STOCK' ? '0' : String(variant.available_qty),
    status: variant.supply_status,
    eta: variant.pre_order_eta ?? '',
  })));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function updateRow(index: number, patch: Partial<VariantRow>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    setMessage(null);
  }

  function submit() {
    if (hasVariants) {
      const payload = rows.map((row) => ({
        id: row.id,
        availableQty: row.status === 'OUT_OF_STOCK' ? 0 : Number(row.quantity),
        supplyStatus: row.status,
        preOrderEta: row.status === 'PRE_ORDER' ? row.eta : '',
      }));
      if (payload.some((row) => !Number.isInteger(row.availableQty) || row.availableQty < 0)) {
        setMessage('Số lượng cung ứng phải là số nguyên không âm.');
        return;
      }
      if (payload.some((row) => row.supplyStatus === 'PRE_ORDER' && !row.preOrderEta)) {
        setMessage('Vui lòng chọn ngày dự kiến có hàng cho biến thể nhận đặt trước.');
        return;
      }
      const total = payload.reduce((sum, row) => sum + row.availableQty, 0);
      if (total < reservedQty) {
        setMessage(`Tổng số lượng cung ứng không được nhỏ hơn ${reservedQty} sản phẩm đang giữ.`);
        return;
      }
      startTransition(async () => {
        await send({ variants: payload });
      });
      return;
    }

    const nextQuantity = status === 'OUT_OF_STOCK' ? 0 : Number(quantity);
    if (!Number.isInteger(nextQuantity) || nextQuantity < reservedQty) {
      setMessage(`Số lượng phải là số nguyên và không nhỏ hơn ${reservedQty} sản phẩm đang giữ.`);
      return;
    }

    if (status === 'PRE_ORDER' && !eta) {
      setMessage('Vui lòng chọn ngày dự kiến có hàng khi nhận đặt trước.');
      return;
    }
    startTransition(async () => {
      await send({
        availableQty: nextQuantity,
        supplyStatus: status,
        preOrderEta: status === 'PRE_ORDER' ? eta : '',
      });
    });
  }

  async function send(body: Record<string, unknown>) {
    try {
      const response = await fetch(`/api/partner/products/${productId}/availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(data?.error?.message ?? 'Không thể cập nhật số lượng cung ứng.');
        return;
      }

      setMessage('Đã cập nhật thông tin cung ứng.');
      router.refresh();
    } catch {
      setMessage('Không thể kết nối máy chủ. Vui lòng thử lại.');
    }
  }

  return (
    <form onSubmit={event => event.preventDefault()} className="mt-4 rounded-lg bg-slate-50 p-3">
      <h4 className="text-sm font-medium">Cập nhật số lượng cung ứng</h4>
      <p className="mt-1 text-xs text-slate-500">
        Admin chỉ theo dõi thông tin doanh nghiệp khai báo. Đang giữ cho đơn hàng: {reservedQty}.
      </p>
      {hasVariants ? (
        <>
          <div className="mt-3 space-y-3">
            {rows.map((row, index) => (
              <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium">{row.label}</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs text-slate-600">
                    Số lượng cung ứng
                    <input
                      type="number"
                      min={0}
                      step={1}
                      required
                      value={row.quantity}
                      disabled={pending || row.status === 'OUT_OF_STOCK'}
                      onChange={(event) => updateRow(index, { quantity: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Trạng thái cung ứng
                    <select
                      value={row.status}
                      disabled={pending}
                      onChange={(event) => {
                        const nextStatus = event.target.value;
                        updateRow(index, {
                          status: nextStatus,
                          quantity: nextStatus === 'OUT_OF_STOCK' ? '0' : row.quantity,
                          eta: nextStatus === 'PRE_ORDER' ? row.eta : '',
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    Ngày dự kiến có hàng
                    <input
                      type="date"
                      value={row.eta}
                      required={row.status === 'PRE_ORDER'}
                      disabled={pending || row.status !== 'PRE_ORDER'}
                      onChange={(event) => updateRow(index, { eta: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tổng số lượng cung ứng: {rows.reduce((sum, row) => sum + (row.status === 'OUT_OF_STOCK' ? 0 : Number(row.quantity) || 0), 0)}
          </p>
        </>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            Số lượng cung ứng
            <input
              type="number"
              min={reservedQty}
              step={1}
              required
              value={quantity}
              disabled={pending || status === 'OUT_OF_STOCK'}
              onChange={(event) => { setQuantity(event.target.value); setMessage(null); }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            Trạng thái cung ứng
            <select
              value={status}
              disabled={pending}
              onChange={(event) => {
                const nextStatus = event.target.value;
                if (nextStatus === 'OUT_OF_STOCK' && reservedQty > 0) {
                  setMessage(`Không thể chuyển sang hết hàng vì đang giữ ${reservedQty} sản phẩm cho đơn hàng.`);
                  return;
                }
                setStatus(nextStatus);
                if (nextStatus === 'OUT_OF_STOCK') setQuantity('0');
                setMessage(null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Ngày dự kiến có hàng
            <input
              type="date"
              value={eta}
              onChange={(event) => { setEta(event.target.value); setMessage(null); }}
              required={status === 'PRE_ORDER'}
              disabled={pending || status !== 'PRE_ORDER'}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={event => {
            if (event.currentTarget.form?.reportValidity()) submit();
          }}
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
