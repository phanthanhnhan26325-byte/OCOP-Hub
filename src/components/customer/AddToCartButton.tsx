'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface ProductVariant {
  id: string;
  label: string;
  price: number | string;
}

export function AddToCartButton({
  productId,
  max,
  variants = [],
}: {
  productId: string;
  max: number;
  variants?: ProductVariant[];
}) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const selectedVariant = variants.find((variant) => variant.id === variantId);

  return (
    <div>
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
                {variant.label} · {Number(variant.price).toLocaleString('vi-VN')}đ
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-slate-200">
          <button type="button" className="px-3 py-2 text-slate-600" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span className="w-10 text-center">{qty}</span>
          <button type="button" className="px-3 py-2 text-slate-600" onClick={() => setQty((q) => Math.min(max, q + 1))}>+</button>
        </div>
        <button
          type="button"
          disabled={pending || (variants.length > 0 && !selectedVariant)}
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
          className="flex-1 rounded-lg bg-emerald-600 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
        </button>
      </div>
      {selectedVariant && (
        <p className="mt-2 text-sm text-emerald-700">
          Giá: {Number(selectedVariant.price).toLocaleString('vi-VN')}đ
        </p>
      )}
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
