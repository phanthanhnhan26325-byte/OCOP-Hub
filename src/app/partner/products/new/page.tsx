import Link from 'next/link';
import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { ProductForm } from '@/components/partner/ProductForm';

export const dynamic = 'force-dynamic';

export default async function NewPartnerProductPage() {
  const user = await requireApprovedPartner();
  const db = await supabaseServer();
  const { data: categories, error } = await db.from('product_categories').select('id, name').eq('status', 'ACTIVE').order('name');
  if (error) throw new Error(error.message);
  return <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <Link href="/partner/products" className="text-sm font-medium text-[#195c46] hover:underline">← Danh sách sản phẩm</Link>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Thêm sản phẩm</h1><Link href="/partner/products" className="partner-action">Quay lại danh sách</Link></div>
    <p className="mt-2 text-sm leading-6 partner-muted">Điền thông tin và gửi sản phẩm để hệ thống phê duyệt.</p>
    <section className="partner-panel mt-6 p-5 sm:p-7">
      {categories?.length ? <ProductForm categories={categories} partnerId={user.id} /> : <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">Chưa có danh mục đang hoạt động. Vui lòng liên hệ quản trị viên để bổ sung danh mục trước khi tạo sản phẩm.</p>}
    </section>
  </div>;
}
