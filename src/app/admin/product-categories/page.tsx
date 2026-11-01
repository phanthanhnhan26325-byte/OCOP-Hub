import { ProductCategoryManager } from '@/components/admin/ProductCategoryManager';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AdminProductCategoriesPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: categories, error } = await supabase
    .from('product_categories')
    .select('id, name, slug, status')
    .order('name');
  if (error) throw new Error(error.message);

  return (
    <div>
      <h1 className="text-2xl font-bold">Danh mục sản phẩm</h1>
      <p className="mt-1 text-sm text-slate-500">Danh mục đã được sử dụng sẽ được ngừng hoạt động thay vì xóa để giữ nguyên lịch sử sản phẩm.</p>
      <section className="mt-5">
        <ProductCategoryManager categories={categories ?? []} />
      </section>
    </div>
  );
}
