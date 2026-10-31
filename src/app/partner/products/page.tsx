import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { ProductForm } from '@/components/partner/ProductForm';
import { SubmitProductButton } from '@/components/partner/SubmitProductButton';
import { DeleteButton } from '@/components/partner/DeleteButton';

export const dynamic = 'force-dynamic';

const pStatus: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING: 'Chờ duyệt', APPROVED: 'Đã đăng bán', REJECTED: 'Bị từ chối', UNLISTED: 'Đã gỡ',
};

export default async function PartnerProductsPage() {
  const user = await requireApprovedPartner();
  const supabase = await supabaseServer();
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*, product_categories(name), product_availability(*), product_images(url, sort_order), product_variants(id, label, price)')
    .eq('partner_id', user.id)
    .order('created_at', { ascending: false });
  if (productsError) throw new Error(productsError.message);
  const { data: categories, error: categoriesError } = await supabase
    .from('product_categories')
    .select('id, name')
    .eq('status', 'ACTIVE')
    .in('name', ['Đặc sản', 'Quà tặng', 'Đồ lưu niệm', 'Khác'])
    .order('name');
  if (categoriesError) throw new Error(categoriesError.message);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Quản lý sản phẩm</h1>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Tạo sản phẩm mới</h2>
        <p className="mb-3 text-sm text-slate-500">
          Quản lý ở đây là <b>khai báo số lượng có thể cung cấp</b> — không phải quản lý tồn kho vật lý.
        </p>
        <ProductForm categories={categories ?? []} partnerId={user.id} />
      </div>

      <div className="mt-8 space-y-4">
        {products.map((p) => {
          const av = p.product_availability as { available_qty: number; reserved_qty: number; supply_status: string; pre_order_eta: string | null } | null;
          const image = p.product_images?.[0]?.url;
          return (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-4">
                  {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={p.name} className="h-20 w-20 rounded-lg object-cover" />
                  )}
                  <div>
                    <h3 className="font-semibold">{p.name}</h3>
                    <p className="text-sm text-slate-500">{formatVnd(p.price)} · {pStatus[p.status] ?? p.status}</p>
                    {(p.product_categories?.[0]?.name || p.classifications?.length > 0) && (
                      <p className="mt-1 text-xs text-emerald-700">{p.product_categories?.[0]?.name ?? p.classifications.join(' · ')}</p>
                    )}
                    {p.product_variants?.length > 0 && (
                      <ul className="mt-1 text-xs text-slate-600">
                        {p.product_variants.map((variant: { id: string; label: string; price: number | string }) => (
                          <li key={variant.id}>{variant.label} · {formatVnd(variant.price)}</li>
                        ))}
                      </ul>
                    )}
                    {p.short_description && <p className="mt-1 text-sm text-slate-600">{p.short_description}</p>}
                    {p.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{p.description}</p>}
                    {p.status === 'REJECTED' && p.reject_reason && (
                      <p className="text-sm text-red-600">Lý do: {p.reject_reason}</p>
                    )}
                    {av && (
                      <p className="mt-1 text-sm text-slate-600">
                        Khai báo cung ứng: {av.available_qty} (đã giữ chỗ {av.reserved_qty}) · {av.supply_status}
                        {av.pre_order_eta ? ` · ETA ${new Date(av.pre_order_eta).toLocaleDateString('vi-VN')}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {(p.status === 'DRAFT' || p.status === 'REJECTED') && (
                    <SubmitProductButton productId={p.id} />
                  )}
                  <DeleteButton url={`/api/partner/products/${p.id}`} label="Xóa" />
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
