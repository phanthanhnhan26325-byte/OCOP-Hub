'use client';

import { useRef, useState } from 'react';
import { variantAvailability, type PartnerProduct } from '@/modules/partner/product-list';
import { ProductAvailabilityForm } from './ProductAvailabilityForm';

export function ProductAvailabilityDialog({ product }: { product: PartnerProduct }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [session, setSession] = useState(0);
  const availability = product.product_availability;

  return <>
    <button
      type="button"
      onClick={() => { setSession(value => value + 1); dialog.current?.showModal(); }}
      className="rounded-lg border border-[#cdded5] px-3 py-1.5 text-xs font-medium text-[#195c46] hover:bg-[#eaf4ee]"
    >
      Cập nhật số lượng
    </button>
    <dialog
      ref={dialog}
      aria-labelledby={`availability-title-${product.id}`}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-[#dce6e1] bg-white p-5 text-left text-[#193b3a] shadow-xl backdrop:bg-[#10281f]/45 sm:p-7"
      onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={`availability-title-${product.id}`} className="text-lg font-semibold">Cập nhật số lượng cung ứng</h2>
          <p className="mt-1 text-xs partner-muted">{product.name}</p>
        </div>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Đóng cập nhật số lượng" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl hover:bg-slate-100">×</button>
      </div>
      <ProductAvailabilityForm
        key={session}
        productId={product.id}
        variants={product.product_variants.map(variant => ({ id: variant.id, label: variant.label, ...variantAvailability(variant) }))}
        availableQty={availability?.available_qty ?? 0}
        reservedQty={availability?.reserved_qty ?? 0}
        supplyStatus={availability?.supply_status ?? 'OUT_OF_STOCK'}
        preOrderEta={availability?.pre_order_eta ?? null}
      />
    </dialog>
  </>;
}
