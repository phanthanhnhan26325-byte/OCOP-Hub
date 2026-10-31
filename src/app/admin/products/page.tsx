import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { ReviewControls } from '@/components/admin/ReviewControls';

export const dynamic = 'force-dynamic';

const productStatusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã đăng bán',
  REJECTED: 'Bị từ chối',
  UNLISTED: 'Đã gỡ',
};

export default async function AdminProductsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, slug, price, status, classifications, product_categories(name), product_variants(id, label, price), short_description, description, reject_reason, ocop_cert_no, created_at, partner_profiles(business_name), product_availability(available_qty, supply_status), product_images(url, sort_order)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div>
      <h1 className="text-2xl font-bold">Phê duyệt sản phẩm</h1>
      <div className="mt-6 space-y-4">
        {products.map((p) => {
          const av = p.product_availability as unknown as { available_qty: number; supply_status: string } | null;
          const image = p.product_images?.[0]?.url;
          return (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex gap-4">
                {image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={p.name} className="h-24 w-24 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="text-sm text-slate-500">
                    {(p.partner_profiles as unknown as { business_name: string } | null)?.business_name} · {Number(p.price).toLocaleString('vi-VN')}đ ·
                    Cung ứng: {av?.available_qty ?? 0} ({av?.supply_status}){p.ocop_cert_no ? ` · OCOP: ${p.ocop_cert_no}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">/{p.slug} · {productStatusLabel[p.status] ?? p.status}</p>
                  {(p.product_categories?.[0]?.name || p.classifications.length > 0) && (
                    <p className="mt-1 text-xs text-emerald-700">{p.product_categories?.[0]?.name ?? p.classifications.join(' · ')}</p>
                  )}
                  {p.product_variants.length > 0 && (
                    <ul className="mt-1 text-xs text-slate-600">
                      {p.product_variants.map((variant) => (
                        <li key={variant.id}>{variant.label} · {Number(variant.price).toLocaleString('vi-VN')}đ</li>
                      ))}
                    </ul>
                  )}
                  {p.short_description && <p className="mt-2 text-sm text-slate-600">{p.short_description}</p>}
                  {p.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{p.description}</p>}
                  {p.status === 'REJECTED' && p.reject_reason && (
                    <p className="mt-2 text-sm text-red-600">Lý do từ chối: {p.reject_reason}</p>
                  )}
                  {p.status === 'PENDING' && <ReviewControls endpoint={`/api/admin/products/${p.id}/review`} />}
                </div>
              </div>
            </div>
          );
        })}
        {products.length === 0 && <p className="text-slate-500">Chưa có sản phẩm nào.</p>}
      </div>
    </div>
  );
}
