import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { ProductForm, type EditableProduct } from '@/components/partner/ProductForm';

export default async function EditPartnerProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireApprovedPartner();
  const { id } = await params;
  const db = await supabaseServer();
  const { data: product, error } = await db.from('products')
    .select('id, name, slug, short_description, description, price, category_id, ocop_cert_no, status, reject_reason, product_images(url, sort_order), product_variants(id, label, price, product_variant_availability(available_qty, supply_status, pre_order_eta))')
    .eq('id', id).eq('partner_id', user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) notFound();
  const { data: categories, error: categoryError } = await db.from('product_categories').select('id, name, status').order('name');
  if (categoryError) throw new Error(categoryError.message);
  return <div className="max-w-5xl">
    <Link href="/partner/products" className="text-sm font-medium text-[#195c46] hover:underline">← Danh sách sản phẩm</Link>
    <h1 className="mt-5 text-2xl font-semibold">Sửa sản phẩm</h1>
    {product.reject_reason && <p role="note" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">Lý do từ chối: {product.reject_reason}</p>}
      <p className="mt-3 text-sm partner-muted">Thông tin hiện tại đã được điền sẵn. Sau khi lưu thay đổi, sản phẩm sẽ được gửi duyệt lại.</p>
      <section className="partner-panel mt-6 p-5 sm:p-7"><ProductForm categories={(categories ?? []).filter(category => category.status === 'ACTIVE' || category.id === product.category_id)} partnerId={user.id} product={product as EditableProduct} /></section>
  </div>;
}
