import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: PageProps<'/products'>) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const supabase = await supabaseServer();

  let query = supabase
    .from('products')
    .select('id, name, slug, price, classifications, product_categories(name), product_variants(id, label, price), short_description, product_images(url, sort_order), partner_profiles(business_name), product_availability(available_qty, reserved_qty, supply_status)')
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false })
    .limit(48);
  if (q) query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`);
  const { data: products, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-bold">Danh sách sản phẩm OCOP</h1>
      <form className="mt-4 flex max-w-md gap-2" action="/products">
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm sản phẩm..."
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
        />
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">Tìm</button>
      </form>

      {products.length === 0 ? (
        <p className="mt-10 text-slate-500">Không có kết quả phù hợp{q ? ` cho “${q}”` : ''}.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          {products.map((p) => {
            const av = p.product_availability as unknown as { available_qty: number; reserved_qty: number; supply_status: string } | null;
            const remaining = av ? av.available_qty - av.reserved_qty : 0;
            return (
              <Link key={p.id} href={`/products/${p.slug}`} className="group rounded-xl border border-slate-200 bg-white p-3 hover:shadow-md">
                <div className="aspect-square overflow-hidden rounded-lg bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.product_images?.[0]?.url ?? 'https://placehold.co/400x400?text=OCOP'} alt={p.name} className="h-full w-full object-cover" />
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-medium">{p.name}</h3>
                <p className="text-xs text-slate-500">{(p.partner_profiles as unknown as { business_name: string } | null)?.business_name}</p>
                {(p.product_categories?.[0]?.name || p.classifications.length > 0) && (
                  <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{p.product_categories?.[0]?.name ?? p.classifications.join(' · ')}</p>
                )}
                <p className="mt-1 font-semibold text-emerald-700">
                  {p.product_variants.length
                    ? `Từ ${formatVnd(Math.min(...p.product_variants.map((variant) => Number(variant.price))))}`
                    : formatVnd(p.price)}
                </p>
                <p className="text-xs text-slate-400">
                  {av?.supply_status === 'PRE_ORDER' ? 'Đặt trước' : remaining > 0 ? `Còn ${remaining}` : 'Hết hàng'}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
