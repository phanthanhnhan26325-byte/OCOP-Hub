'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { formatVnd } from '@/lib/money';
import { categoryName, productStatuses, variantAvailability, type PartnerProduct } from '@/modules/partner/product-list';
import { ProductAvailabilityForm } from './ProductAvailabilityForm';

export function ProductDetails({ product }: { product: PartnerProduct }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editingSession, setEditingSession] = useState(0);
  const availability = product.product_availability;
  return <>
    <button type="button" onClick={() => { setEditingSession(value => value + 1); dialog.current?.showModal(); }} className="rounded-lg border border-[#cdded5] px-3 py-1.5 text-xs font-medium text-[#195c46] hover:bg-[#eaf4ee]">Chi tiết</button>
    <dialog ref={dialog} aria-labelledby={`product-title-${product.id}`} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-[#dce6e1] bg-white p-5 text-left text-[#193b3a] shadow-xl backdrop:bg-[#10281f]/45 sm:p-7" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="flex items-start justify-between gap-4 border-b border-[#eaf0ec] pb-4">
        <div><h2 id={`product-title-${product.id}`} className="text-lg font-semibold">{product.name}</h2><p className="mt-1 text-xs partner-muted">{categoryName(product)} · {productStatuses[product.status] ?? product.status}</p></div>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Đóng chi tiết sản phẩm" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl hover:bg-slate-100">×</button>
      </div>
      {product.product_images.length > 0 && <div className="mt-4 flex gap-3 overflow-x-auto">{[...product.product_images].sort((a, b) => a.sort_order - b.sort_order).map((image, index) => <img key={`${image.url}-${index}`} src={image.url} alt={`${product.name} — ảnh ${index + 1}`} className="h-28 w-28 shrink-0 rounded-xl border border-[#eaf0ec] object-cover" />)}</div>}
      <p className="mt-4 text-xl font-semibold text-[#195c46]">{formatVnd(product.price)}</p>
      {product.short_description && <p className="mt-3 text-sm leading-6">{product.short_description}</p>}
      {product.description && <p className="mt-3 whitespace-pre-line text-sm leading-6 partner-muted">{product.description}</p>}
      {product.ocop_cert_no && <p className="mt-3 text-xs partner-muted">Chứng nhận OCOP: {product.ocop_cert_no}</p>}
      {product.product_variants.length > 0 && <ul className="mt-4 space-y-2 text-sm">{product.product_variants.map(variant => {
        const variantAvail = variantAvailability(variant);
        return <li key={variant.id} className="rounded-lg bg-[#f5f8f5] px-3 py-2">
          <div className="flex justify-between gap-3"><span>{variant.label}</span><span className="font-medium">{formatVnd(variant.price)}</span></div>
          <p className="mt-1 text-xs partner-muted">
            {variantAvail.supply_status === 'PRE_ORDER'
              ? `Đặt trước${variantAvail.pre_order_eta ? ` · dự kiến ${new Date(variantAvail.pre_order_eta).toLocaleDateString('vi-VN')}` : ''}`
              : variantAvail.supply_status === 'IN_STOCK' && variantAvail.available_qty > 0
                ? `Cung ứng: ${variantAvail.available_qty}`
                : 'Hết hàng'}
          </p>
        </li>;
      })}</ul>}
      {product.status === 'REJECTED' && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Lý do từ chối: {product.reject_reason || 'Chưa có lý do được ghi nhận.'}</p>}
      <Link href={`/partner/products/${product.id}/edit`} className="partner-action mt-5">Sửa thông tin sản phẩm</Link>
      <ProductAvailabilityForm
        key={editingSession}
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
