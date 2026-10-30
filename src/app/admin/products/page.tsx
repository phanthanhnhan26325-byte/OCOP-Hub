import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { ReviewControls } from '@/components/admin/ReviewControls';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: products } = await supabase
    .from('products')
    .select('id, name, slug, price, status, reject_reason, ocop_cert_no, created_at, partner_profiles(business_name), product_availability(available_qty, supply_status)')
    .eq('status', 'PENDING')
    .order('created_at');

  return (
    <div>
      <h1 className="text-2xl font-bold">Phê duyệt sản phẩm</h1>
      <div className="mt-6 space-y-4">
        {(products ?? []).map((p) => {
          const av = p.product_availability as unknown as { available_qty: number; supply_status: string } | null;
          return (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-slate-500">
                {(p.partner_profiles as unknown as { business_name: string } | null)?.business_name} · {Number(p.price).toLocaleString('vi-VN')}đ ·
                Cung ứng: {av?.available_qty ?? 0} ({av?.supply_status}){p.ocop_cert_no ? ` · OCOP: ${p.ocop_cert_no}` : ''}
              </p>
              <p className="text-xs text-slate-400">/{p.slug}</p>
              <ReviewControls endpoint={`/api/admin/products/${p.id}/review`} />
            </div>
          );
        })}
        {(!products || products.length === 0) && <p className="text-slate-500">Không có sản phẩm chờ duyệt.</p>}
      </div>
    </div>
  );
}
