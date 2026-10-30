'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function AddToCartButton({ productId, max }: { productId: string; max: number }) {
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-lg border border-slate-200">
          <button className="px-3 py-2 text-slate-600" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <span className="w-10 text-center">{qty}</span>
          <button className="px-3 py-2 text-slate-600" onClick={() => setQty((q) => Math.min(max, q + 1))}>+</button>
        </div>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await fetch('/api/cart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, qty }),
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
      {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
    </div>
  );
}
