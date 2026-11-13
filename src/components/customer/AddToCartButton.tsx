'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { formatVnd } from '@/lib/money';

interface VariantAvailability {
  available_qty: number;
  supply_status: string;
  pre_order_eta: string | null;
}

interface ProductVariant {
  id: string;
  label: string;
  price: number | string;
  product_variant_availability?: VariantAvailability | VariantAvailability[] | null;
}

function variantAvailability(variant: ProductVariant) {
  const relation = variant.product_variant_availability;
  return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
}

function variantPurchasable(variant: ProductVariant) {
  const availability = variantAvailability(variant);
  if (!availability) return true;
  if (availability.supply_status === 'PRE_ORDER') return true;
  return availability.supply_status === 'IN_STOCK' && availability.available_qty > 0;
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
  const [variantId, setVariantId] = useState(() => (variants.find(variantPurchasable) ?? variants[0])?.id ?? '');
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [pendingAction, setPendingAction] = useState<'cart' | 'checkout' | null>(null);
  const router = useRouter();
  const selectedVariant = variants.find((variant) => variant.id === variantId);
  const selectedAvailability = selectedVariant ? variantAvailability(selectedVariant) : null;
  const selectedRemaining = selectedAvailability ? selectedAvailability.available_qty : Math.max(max, 1);
  const selectedPurchasable = variants.length === 0
    ? canPurchase
    : selectedVariant
      ? variantPurchasable(selectedVariant)
      : false;
  const canPurchaseNow = canPurchase && selectedPurchasable;
  const effectiveMax = Math.max(selectedRemaining, 1);
  const isPreOrder = selectedAvailability?.supply_status === 'PRE_ORDER';
  const stockMessage = !canPurchaseNow
    ? 'Hết hàng'
    : isPreOrder
      ? `Đặt trước${selectedAvailability.pre_order_eta ? ` · dự kiến có hàng ${new Date(selectedAvailability.pre_order_eta).toLocaleDateString('vi-VN')}` : ''}`
      : 'Còn hàng';

  async function submitPurchase(action: 'cart' | 'checkout') {
    setPendingAction(action);
    setFeedback(null);
    try {
      const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, variantId: variantId || null, qty }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        if (action === 'checkout') {
          if (typeof data?.itemId !== 'string') {
            setFeedback({ message: 'Không thể chuyển đến bước thanh toán. Vui lòng thử lại.', isError: true });
            return;
          }
          router.push(`/checkout?items=${encodeURIComponent(data.itemId)}`);
          return;
        }
        setFeedback({ message: 'Đã thêm vào giỏ hàng', isError: false });
        router.refresh();
        return;
      }

      if (response.status === 401) {
        const next = action === 'checkout' ? window.location.pathname : '/cart';
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setFeedback({
        message: data?.error?.message ?? 'Không thể thêm sản phẩm vào giỏ hàng.',
        isError: true,
      });
    } catch {
      setFeedback({ message: 'Không thể kết nối. Vui lòng thử lại.', isError: true });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div>
      <p aria-live="polite" aria-atomic="true" className="mt-4 text-3xl font-bold text-emerald-700">
        {formatVnd(selectedVariant?.price ?? price)}
      </p>
      {children}
      <div className="mt-6">
      {variants.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl bg-[#f5f6e9] px-4 py-3">
          <p id="product-variant-label" className="text-sm font-semibold">Khối lượng</p>
          <div role="group" aria-labelledby="product-variant-label" className="flex flex-wrap gap-2">
            {variants.map((variant) => {
              const isSelected = variant.id === variantId;
              const isPurchasable = variantPurchasable(variant);
              return (
                <button
                  key={variant.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!isPurchasable}
                  onClick={() => {
                    setVariantId(variant.id);
                    setQty(1);
                    setFeedback(null);
                  }}
                  className={`min-h-10 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                    isSelected
                      ? 'border-emerald-600 bg-white text-emerald-700 ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-500'
                  }`}
                >
                  {variant.label}{!isPurchasable ? ' · Hết hàng' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-3">
              <p id="product-quantity-label" className="text-sm font-semibold">Số lượng</p>
              <div role="group" aria-labelledby="product-quantity-label" className="flex h-11 items-center rounded-full border border-slate-200 bg-white">
                <button type="button" disabled={!canPurchaseNow} aria-label="Giảm số lượng" className="px-4 py-2 text-slate-600 disabled:opacity-50" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span aria-live="polite" className="min-w-8 text-center text-sm">{qty}</span>
                <button type="button" disabled={!canPurchaseNow} aria-label="Tăng số lượng" className="px-4 py-2 text-slate-600 disabled:opacity-50" onClick={() => setQty((q) => Math.min(effectiveMax, q + 1))}>+</button>
              </div>
            </div>
            <span aria-live="polite" className={`inline-flex items-center gap-2 text-sm font-semibold ${!canPurchaseNow ? 'text-red-600' : isPreOrder ? 'text-amber-700' : 'text-emerald-700'}`}>
              <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${!canPurchaseNow ? 'bg-red-500' : isPreOrder ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                {!canPurchaseNow ? '!' : isPreOrder ? '↗' : '✓'}
              </span>
              {stockMessage}
            </span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canPurchaseNow || pendingAction !== null || (variants.length > 0 && !selectedVariant)}
            onClick={() => void submitPurchase('cart')}
            className="min-h-12 rounded-lg border border-emerald-600 bg-white px-2 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {pendingAction === 'cart' ? 'Đang thêm...' : 'Thêm vào giỏ hàng'}
          </button>
          <button
            type="button"
            disabled={!canPurchaseNow || pendingAction !== null || (variants.length > 0 && !selectedVariant)}
            onClick={() => void submitPurchase('checkout')}
            className="min-h-12 rounded-lg bg-emerald-600 px-2 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pendingAction === 'checkout' ? 'Đang chuyển...' : '⚡ Mua ngay'}
          </button>
        </div>
      </div>
      {feedback && (
        <p role={feedback.isError ? 'alert' : 'status'} className={`mt-2 text-sm ${feedback.isError ? 'text-red-700' : 'text-emerald-700'}`}>
          {feedback.message}
        </p>
      )}
      </div>
    </div>
  );
}
