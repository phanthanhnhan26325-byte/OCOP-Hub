'use client';

import { useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { formatVnd } from '@/lib/money';

interface ProductVariant {
  id: string;
  label: string;
  price: number | string;
}

export function AddToCartButton({
  productId,
  max,
  variants = [],
  price,
  children,
  canPurchase = true,
}: {
  productId: string;
  max: number;
  variants?: ProductVariant[];
  price: number | string;
  children?: ReactNode;
  canPurchase?: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const selectedVariant = variants.find((variant) => variant.id === variantId);

  return (
    <div>
      <p aria-live="polite" aria-atomic="true" className="mt-4 text-3xl font-bold text-emerald-700">
        {formatVnd(selectedVariant?.price ?? price)}
      </p>
      {children}
      <div className="mt-6">
      {variants.length > 0 && (
        <label className="mb-3 block text-sm font-medium">
          Khối lượng
          <select
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-end gap-3">
        <div>
          <p id="product-quantity-label" className="mb-2 text-sm font-medium">Số lượng</p>
          <div role="group" aria-labelledby="product-quantity-label" className="flex h-12 items-center rounded-lg border border-slate-200">
          <button type="button" disabled={!canPurchase} aria-label="Giảm số lượng" className="px-3 py-2 text-slate-600" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span aria-live="polite" className="w-10 text-center">{qty}</span>
          <button type="button" disabled={!canPurchase} aria-label="Tăng số lượng" className="px-3 py-2 text-slate-600" onClick={() => setQty((q) => Math.min(max, q + 1))}>+</button>
          </div>
        </div>
        <button
          type="button"
          disabled={!canPurchase || pending || (variants.length > 0 && !selectedVariant)}
          onClick={() =>
            startTransition(async () => {
              const res = await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, variantId: variantId || null, qty }),
              });
              if (res.ok) {
                setMsg('Đã thêm vào giỏ hàng');
                router.refresh();
              } else {
                const data = await res.json().catch(() => null);
                if (res.status === 401) {
                  router.push('/login?next=/cart');
                } else {
                  setMsg(data?.error?.message ?? 'Không thể thêm vào giỏ');
                }
              }
            })
          }
          className="min-h-12 flex-1 rounded-lg bg-emerald-600 px-3 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {!canPurchase ? 'Hết hàng' : pending ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
      </div>
    </div>
  );
}
