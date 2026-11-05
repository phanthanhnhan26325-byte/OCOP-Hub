'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteProductCategoryButtonProps {
  categoryId: string;
  categoryName: string;
  redirectAfterDelete?: boolean;
}

export function DeleteProductCategoryButton({
  categoryId,
  categoryName,
  redirectAfterDelete = false,
}: DeleteProductCategoryButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function removeCategory() {
    if (!window.confirm(
      `Bạn có chắc muốn xóa danh mục "${categoryName}"? Sản phẩm hiện có sẽ được giữ lại nhưng không còn thuộc danh mục này.`,
    )) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/categories/${categoryId}`, {
          method: 'DELETE',
        });
        const result = await response.json().catch(() => null);

        if (!response.ok) {
          setMessage(result?.error?.message ?? 'Không thể xóa danh mục.');
          return;
        }

        if (redirectAfterDelete) {
          router.push('/admin/product-categories');
        } else {
          router.refresh();
        }
      } catch {
        setMessage('Không thể kết nối để xóa danh mục. Vui lòng thử lại.');
      }
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={removeCategory}
        className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {pending ? 'Đang xóa...' : 'Xóa'}
      </button>
      {message && (
        <p role="alert" className="mt-1 text-left text-xs text-rose-700">
          {message}
        </p>
      )}
    </div>
  );
}
