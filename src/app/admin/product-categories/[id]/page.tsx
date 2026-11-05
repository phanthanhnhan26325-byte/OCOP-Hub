import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { DeleteProductCategoryButton } from '@/components/admin/DeleteProductCategoryButton';

export const dynamic = 'force-dynamic';

const productStatusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đang đăng bán',
  REJECTED: 'Bị từ chối',
  UNLISTED: 'Đã gỡ',
};

interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  price: number | string;
  status: string;
  created_at: string;
  partner_profiles: { business_name: string } | { business_name: string }[] | null;
  product_availability:
    | { available_qty: number; reserved_qty: number }
    | { available_qty: number; reserved_qty: number }[]
    | null;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export default async function AdminCategoryProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: category, error: categoryError } = await supabase
    .from('product_categories')
    .select('id, name, slug, status, created_at')
    .eq('id', id)
    .maybeSingle();

  if (categoryError) throw new Error(categoryError.message);
  if (!category) notFound();

  const { data, error } = await supabase
    .from('products')
    .select('id, name, slug, price, status, created_at, partner_profiles(business_name), product_availability(available_qty, reserved_qty)')
    .eq('category_id', category.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const products = (data ?? []) as unknown as ProductSummary[];

  return (
    <div>
      <Link
        href="/admin/product-categories"
        className="text-sm font-medium text-emerald-800 hover:underline"
      >
        ← Danh mục sản phẩm
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{category.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Thông tin danh mục và các sản phẩm đang được xếp vào danh mục này.
          </p>
        </div>
        <DeleteProductCategoryButton
          categoryId={category.id}
          categoryName={category.name}
          redirectAfterDelete
        />
      </div>

      <section
        aria-label="Thông tin danh mục"
        className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <p className="text-xs text-slate-500">Tên danh mục</p>
          <p className="mt-1 font-medium">{category.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Slug</p>
          <p className="mt-1 font-medium">{category.slug}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Trạng thái</p>
          <p className="mt-1 font-medium">
            {category.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngừng hoạt động'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Số sản phẩm</p>
          <p className="mt-1 font-medium">{products.length}</p>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-slate-500">Ngày tạo</p>
          <p className="mt-1 font-medium">{formatDate(category.created_at)}</p>
        </div>
      </section>

      <h2 className="mt-6 text-lg font-semibold">Sản phẩm trong danh mục</h2>
      <div className="mt-3 space-y-3">
        {products.map((product) => {
          const partner = firstRelation(product.partner_profiles);
          const availability = firstRelation(product.product_availability);
          return (
            <Link
              key={product.id}
              href={`/admin/products/${product.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-emerald-900">{product.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                  {productStatusLabel[product.status] ?? product.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
                <span>{formatVnd(product.price)}</span>
                <span>
                  Số lượng đối tác khai báo: {availability?.available_qty ?? 0}
                  {availability ? ` · Đã giữ ${availability.reserved_qty}` : ''}
                </span>
                <span>Cập nhật: {formatDate(product.created_at)}</span>
              </div>
              <p className="mt-3 text-xs font-medium text-emerald-800">Bấm để xem chi tiết →</p>
            </Link>
          );
        })}
        {products.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Chưa có sản phẩm trong danh mục này.
          </p>
        )}
      </div>
    </div>
  );
}
