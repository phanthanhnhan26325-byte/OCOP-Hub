'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatVnd } from '@/lib/money';

interface CartRow {
  id: string;
  qty: number;
  product_id: string;
  variant_id: string | null;
  product_variants: {
    id: string;
    label: string;
    price: string | number;
    product_variant_availability: { available_qty: number; supply_status: string } | { available_qty: number; supply_status: string }[] | null;
  } | null;
  products: {
    name: string; slug: string; price: string; classifications: string[]; partner_id: string;
    product_images: { url: string; sort_order: number }[];
    product_availability: { available_qty: number; reserved_qty: number } | null;
    partner_profiles: { business_name: string } | null;
  } | null;
}

interface CartItem {
  id: string;
  qty: number;
  product_id: string;
  variant_id: string | null;
  product_variants: CartRow['product_variants'];
  products: CartRow['products'];
}

interface Grouped {
  partnerId: string;
  partnerName: string;
  items: CartItem[];
}

export function CartView() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const setLoadedItems = useCallback((rows: CartRow[]) => {
    const nextItems = rows.map((r) => ({
      id: r.id, qty: r.qty, product_id: r.product_id, variant_id: r.variant_id,
      product_variants: r.product_variants, products: r.products,
    }));
    setItems(nextItems);
    setSelectedItemIds((current) => current === null
      ? null
      : current.filter((id) => nextItems.some((item) => item.id === id)));
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/cart');
    if (res.status === 401) {
      router.push('/login?next=/cart');
      return;
    }
    const data = await res.json();
    setLoadedItems(data.items ?? []);
  }, [router, setLoadedItems]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/cart');
      if (cancelled) return;
      if (res.status === 401) {
        router.push('/login?next=/cart');
        return;
      }
      const data = await res.json();
      setLoadedItems(data.items ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, setLoadedItems]);

  const groups: Grouped[] = Object.values(
    items.reduce<Record<string, Grouped>>((acc, item) => {
      const pid = item.products?.partner_id ?? 'unknown';
      if (!acc[pid]) {
        acc[pid] = {
          partnerId: pid,
          partnerName: item.products?.partner_profiles?.business_name ?? 'Không rõ',
          items: [],
        };
      }
      acc[pid].items.push(item);
      return acc;
    }, {}),
  );

  const selectedIds = selectedItemIds ?? items.map((item) => item.id);
  const selectedIdSet = new Set(selectedIds);
  const selectedItems = items.filter((item) => selectedIdSet.has(item.id));
  const selectedTotal = selectedItems.reduce(
    (total, item) => total + Number(item.product_variants?.price ?? item.products?.price ?? 0) * item.qty,
    0,
  );
  const checkoutHref = selectedIds.length
    ? `/checkout?items=${encodeURIComponent(selectedIds.join(','))}`
    : '/cart';

  function toggleItems(itemIds: string[], checked: boolean) {
    setSelectedItemIds((current) => {
      const next = new Set(current ?? items.map((item) => item.id));
      for (const id of itemIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next.size === items.length ? null : [...next];
    });
  }

  async function updateQty(itemId: string, qty: number) {
    const res = await fetch('/api/cart', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, qty }),
    });
    if (res.ok) {
      await load();
      router.refresh();
    }
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/cart?itemId=${itemId}`, { method: 'DELETE' });
    if (res.ok) {
      await load();
      router.refresh();
    }
  }

  if (loading) return <p className="px-4 py-10 text-slate-500">Đang tải giỏ hàng...</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold">Giỏ hàng</h1>
      {groups.length === 0 ? (
        <p className="mt-6 text-slate-500">
          Giỏ hàng trống. <Link href="/products" className="text-emerald-700 underline">Mua sắm ngay</Link>
        </p>
      ) : (
        <>
          <label className="mt-5 flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={selectedIds.length === items.length}
              onChange={(event) => toggleItems(items.map((item) => item.id), event.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
            Chọn tất cả ({items.length} sản phẩm)
          </label>
          {groups.map((g) => (
            <div key={g.partnerId} className="mt-6 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={g.items.every((item) => selectedIdSet.has(item.id))}
                  onChange={(event) => toggleItems(g.items.map((item) => item.id), event.target.checked)}
                  aria-label={`Chọn tất cả sản phẩm của ${g.partnerName}`}
                  className="h-4 w-4 accent-emerald-700"
                />
                Doanh nghiệp: {g.partnerName}
              </div>
              {g.items.map((item) => {
                const relation = item.product_variants?.product_variant_availability;
                const variantAvailability = Array.isArray(relation) ? relation[0] ?? null : relation;
                const remaining = variantAvailability
                  ? variantAvailability.available_qty
                  : item.products?.product_availability
                    ? item.products.product_availability.available_qty - item.products.product_availability.reserved_qty
                    : 0;
                const unavailable = variantAvailability
                  ? variantAvailability.supply_status !== 'PRE_ORDER'
                    && (variantAvailability.supply_status !== 'IN_STOCK' || variantAvailability.available_qty <= 0)
                  : false;
                return (
                  <div key={item.id} className="flex items-center gap-4 border-b border-slate-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIdSet.has(item.id)}
                      onChange={(event) => toggleItems([item.id], event.target.checked)}
                      aria-label={`Chọn ${item.products?.name ?? 'sản phẩm'}`}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.products?.product_images?.[0]?.url ?? 'https://placehold.co/80'} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.products?.name}</p>
                      {item.product_variants && <p className="text-xs text-slate-500">Khối lượng: {item.product_variants.label}</p>}
                      <p className="text-sm text-emerald-700">{formatVnd(item.product_variants?.price ?? item.products?.price ?? 0)}</p>
                      {unavailable
                        ? <p className="text-xs text-red-600">Biến thể này đang hết hàng</p>
                        : variantAvailability?.supply_status !== 'PRE_ORDER' && remaining < item.qty
                          && <p className="text-xs text-amber-600">Chỉ còn {remaining} — vui lòng giảm số lượng</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="rounded border px-2" onClick={() => updateQty(item.id, Math.max(1, item.qty - 1))}>−</button>
                      <span className="w-8 text-center text-sm">{item.qty}</span>
                      <button className="rounded border px-2" onClick={() => updateQty(item.id, Math.min(99, item.qty + 1))}>+</button>
                    </div>
                    <button className="text-sm text-red-600 hover:underline" onClick={() => removeItem(item.id)}>Xóa</button>
                  </div>
                );
              })}
              <div className="px-4 py-2 text-right text-sm text-slate-600">
                Tiền hàng đã chọn: <b>{formatVnd(g.items.filter((item) => selectedIdSet.has(item.id)).reduce(
                  (total, item) => total + Number(item.product_variants?.price ?? item.products?.price ?? 0) * item.qty,
                  0,
                ))}</b>
              </div>
            </div>
          ))}
          <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-4">
            <span className="font-medium">Tổng tiền hàng đã chọn ({selectedIds.length} sản phẩm, chưa phí giao nhận)</span>
            <span className="text-xl font-bold text-emerald-700">{formatVnd(selectedTotal)}</span>
          </div>
          <Link
            href={checkoutHref}
            aria-disabled={selectedIds.length === 0}
            onClick={(event) => {
              if (selectedIds.length === 0) event.preventDefault();
            }}
            className={`mt-4 block rounded-lg py-3 text-center font-medium text-white ${
              selectedIds.length ? 'bg-emerald-600 hover:bg-emerald-700' : 'pointer-events-none bg-slate-400'
            }`}
          >
            Đặt mua {selectedIds.length} sản phẩm đã chọn
          </Link>
        </>
      )}
    </div>
  );
}
