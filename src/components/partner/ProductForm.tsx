'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function ProductForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [form, setForm] = useState({
    name: '', slug: '', shortDescription: '', description: '', price: 0,
    categoryId: '', ocopCertNo: '', imageUrl: '', availableQty: 0, supplyStatus: 'IN_STOCK', preOrderEta: '',
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function autoSlug(name: string) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await fetch('/api/partner/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name,
              slug: form.slug || autoSlug(form.name),
              shortDescription: form.shortDescription,
              description: form.description,
              price: form.price,
              categoryId: form.categoryId || null,
              ocopCertNo: form.ocopCertNo || undefined,
              images: form.imageUrl ? [form.imageUrl] : [],
              availableQty: form.availableQty,
              supplyStatus: form.supplyStatus,
              preOrderEta: form.preOrderEta || null,
            }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok) {
            setMsg('Đã tạo sản phẩm (Bản nháp). Bấm "Gửi duyệt" để đăng.');
            router.refresh();
          } else {
            setMsg(data?.error?.message ?? 'Tạo thất bại');
          }
        });
      }}
      className="space-y-3"
    >
      {msg && <p className="rounded-lg bg-slate-50 p-2 text-sm">{msg}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Tên sản phẩm *
          <input required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: autoSlug(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="text-sm">Slug (URL)
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="text-sm">Giá bán (VNĐ) *
          <input type="number" required min={1} value={form.price || ''}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="text-sm">Danh mục
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">
            <option value="">— Chọn —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Số lượng có thể cung cấp *
          <input type="number" required min={0} value={form.availableQty || ''}
            onChange={(e) => setForm({ ...form, availableQty: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="text-sm">Tình trạng cung ứng
          <select value={form.supplyStatus} onChange={(e) => setForm({ ...form, supplyStatus: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">
            <option value="IN_STOCK">Có sẵn</option>
            <option value="PRE_ORDER">Đặt trước</option>
            <option value="OUT_OF_STOCK">Hết hàng</option>
          </select>
        </label>
        {form.supplyStatus === 'PRE_ORDER' && (
          <label className="text-sm">Thời gian dự kiến cung cấp
            <input type="date" value={form.preOrderEta} onChange={(e) => setForm({ ...form, preOrderEta: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
          </label>
        )}
        <label className="text-sm">Ảnh (URL)
          <input type="url" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="https://..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="text-sm">Số chứng nhận OCOP
          <input value={form.ocopCertNo} onChange={(e) => setForm({ ...form, ocopCertNo: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">Mô tả ngắn
        <input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <label className="block text-sm">Mô tả chi tiết
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? 'Đang lưu...' : 'Tạo sản phẩm'}
      </button>
    </form>
  );
}
