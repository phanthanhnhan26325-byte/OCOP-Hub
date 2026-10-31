import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { AddToCartButton } from '@/components/customer/AddToCartButton';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: product, error } = await supabase
    .from('products')
    .select(
      'id, name, slug, price, short_description, description, classifications, product_categories(name), product_variants(id, label, price), ocop_cert_no, status, product_images(url, sort_order), product_availability(available_qty, reserved_qty, supply_status, pre_order_eta), partner_id, partner_profiles(business_name, address, contact_phone)',
    )
    .eq('slug', slug)
    .eq('status', 'APPROVED')
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);

  if (!product) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Không tìm thấy sản phẩm</h1>
        <Link href="/products" className="mt-3 inline-block text-emerald-700 hover:underline">← Về danh sách sản phẩm</Link>
      </div>
    );
  }

  const avail = product.product_availability as unknown as {
    available_qty: number; reserved_qty: number; supply_status: string; pre_order_eta: string | null;
  } | null;
  const remaining = avail ? avail.available_qty - avail.reserved_qty : 0;
  const partner = product.partner_profiles as unknown as { business_name: string; address: string; contact_phone: string } | null;
  const classification = product.product_categories?.[0]?.name ?? product.classifications[0];

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-2">
      <div className="aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.product_images?.[0]?.url ?? 'https://placehold.co/600x600?text=OCOP'}
          alt={product.name}
          className="h-full w-full object-cover"
        />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-700">OCOP · {partner?.business_name}</p>
        <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
        <p className="mt-2 text-slate-600">{product.short_description}</p>
        {classification && (
          <span className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            {classification}
          </span>
        )}
        <p className="mt-4 text-3xl font-bold text-emerald-700">
          {product.product_variants.length
            ? `Từ ${formatVnd(Math.min(...product.product_variants.map((variant) => Number(variant.price))))}`
            : formatVnd(product.price)}
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p>
            Tình trạng:{' '}
            {avail?.supply_status === 'IN_STOCK' && remaining > 0 ? (
              <span className="font-medium text-emerald-700">Còn hàng ({remaining} sản phẩm có thể cung cấp)</span>
            ) : avail?.supply_status === 'PRE_ORDER' ? (
              <span className="font-medium text-amber-600">
                Đặt trước · dự kiến có hàng {avail.pre_order_eta ? new Date(avail.pre_order_eta).toLocaleDateString('vi-VN') : ''}
              </span>
            ) : (
              <span className="font-medium text-red-600">Hết hàng</span>
            )}
          </p>
          <p className="mt-1 text-slate-500">Địa chỉ: {partner?.address ?? '—'} · SĐT: {partner?.contact_phone ?? '—'}</p>
          {product.ocop_cert_no && <p className="mt-1 text-slate-500">Chứng nhận OCOP: {product.ocop_cert_no}</p>}
        </div>

        <div className="mt-6">
          {remaining > 0 || avail?.supply_status === 'PRE_ORDER' ? (
            <AddToCartButton productId={product.id} max={Math.max(remaining, 1)} variants={product.product_variants} />
          ) : (
            <button disabled className="w-full rounded-lg bg-slate-200 py-3 text-slate-500">Hết hàng</button>
          )}
        </div>

        {product.description && (
          <div className="mt-8">
            <h2 className="font-semibold">Mô tả sản phẩm</h2>
            <p className="mt-2 whitespace-pre-line text-slate-700">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
