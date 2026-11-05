'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DeleteProductCategoryButton } from '@/components/admin/DeleteProductCategoryButton';

interface Category {
  id: string;
  name: string;
  slug: string;
  status: string;
}

interface CategoryFormProps {
  category?: Category;
  pending: boolean;
  onCancel?: () => void;
  onSubmit: (form: HTMLFormElement, id?: string) => void;
}

function CategoryForm({ category, pending, onCancel, onSubmit }: CategoryFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(event.currentTarget, category?.id);
      }}
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto]"
    >
      <label className="text-sm">
        Tên danh mục
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={category?.name}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Slug
        <input
          name="slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          defaultValue={category?.slug}
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Trạng thái
        <select
          name="status"
          defaultValue={category?.status ?? 'ACTIVE'}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </select>
      </label>
      <div className="flex items-end gap-2">
        <button
          disabled={pending}
          className="flex-1 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {pending ? 'Đang lưu...' : category ? 'Lưu thay đổi' : 'Thêm danh mục'}
        </button>
        {onCancel && (
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}

export function ProductCategoryManager({ categories }: { categories: Category[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(form: HTMLFormElement, id?: string) {
    const formData = new FormData(form);
    startTransition(async () => {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(id ? { id } : {}),
          name: formData.get('name'),
          slug: formData.get('slug'),
          status: formData.get('status'),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(result?.error?.message ?? 'Không thể lưu danh mục');
        return;
      }
      setMessage('Đã lưu danh mục.');
      setAdding(false);
      setEditingId(null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setAdding((current) => !current);
            setEditingId(null);
            setMessage(null);
          }}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          {adding ? 'Đóng' : '+ Thêm danh mục'}
        </button>
      </div>

      {adding && (
        <div className="mt-3">
          <CategoryForm pending={pending} onSubmit={save} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Tên danh mục</th>
              <th scope="col" className="px-4 py-3">Slug</th>
              <th scope="col" className="px-4 py-3">Trạng thái</th>
              <th scope="col" className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((category) => (
              <tr key={category.id} className="hover:bg-slate-50/70">
                {editingId === category.id ? (
                  <td colSpan={4} className="p-3">
                    <CategoryForm
                      category={category}
                      pending={pending}
                      onSubmit={save}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/product-categories/${category.id}`}
                        className="text-emerald-800 hover:underline"
                      >
                        {category.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{category.slug}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        category.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {category.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(category.id);
                          setAdding(false);
                          setMessage(null);
                        }}
                        className="rounded-lg border border-emerald-700 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                      >
                        Chỉnh sửa
                      </button>
                      <DeleteProductCategoryButton
                        categoryId={category.id}
                        categoryName={category.name}
                      />
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  Chưa có danh mục sản phẩm.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
    </div>
  );
}
