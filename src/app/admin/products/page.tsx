import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';

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
  partner_id: string;
  partner_profiles: { business_name: string } | { business_name: string }[] | null;
  product_availability: { available_qty: number; reserved_qty: number } | { available_qty: number; reserved_qty: number }[] | null;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string | string[]; q?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const partnerId = typeof params.partner === 'string' ? params.partner : null;
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const supabase = await supabaseServer();

  const productSelection = 'id, name, slug, price, status, created_at, partner_id, partner_profiles(business_name), product_availability(available_qty, reserved_qty)';
  let productsQuery = supabase
    .from('products')
    .select(productSelection)
    .order('created_at', { ascending: false })
    .limit(200);

  if (partnerId) productsQuery = productsQuery.eq('partner_id', partnerId);
  if (query) productsQuery = productsQuery.ilike('name', `%${query}%`);

  const { data: productData, error } = await productsQuery;
  if (error) throw new Error(error.message);

  let products = (productData ?? []) as unknown as ProductSummary[];

  if (query) {
    const { data: partnerMatches, error: partnerError } = await supabase
      .from('partner_profiles')
      .select('user_id')
      .ilike('business_name', `%${query}%`);
    if (partnerError) throw new Error(partnerError.message);

    const matchingPartnerIds = (partnerMatches ?? [])
      .map((partner) => partner.user_id)
      .filter((id) => !partnerId || id === partnerId);

    if (matchingPartnerIds.length > 0) {
      let partnerProductsQuery = supabase
        .from('products')
        .select(productSelection)
        .in('partner_id', matchingPartnerIds)
        .order('created_at', { ascending: false })
        .limit(200);
      if (partnerId) partnerProductsQuery = partnerProductsQuery.eq('partner_id', partnerId);
      const { data: partnerProducts, error: partnerProductsError } = await partnerProductsQuery;
      if (partnerProductsError) throw new Error(partnerProductsError.message);

      const merged = new Map(products.map((product) => [product.id, product]));
      for (const product of (partnerProducts ?? []) as unknown as ProductSummary[]) {
        merged.set(product.id, product);
      }
      products = [...merged.values()].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
  }

  return (
    <div>
      {partnerId && (
        <Link href={`/admin/users/${partnerId}`} className="text-sm font-medium text-emerald-800 hover:underline">
          ← Quay lại hồ sơ đối tác
        </Link>
      )}
      <h1 className={`${partnerId ? 'mt-3 ' : ''}text-2xl font-bold`}>
        {partnerId ? 'Sản phẩm của đối tác' : 'Theo dõi sản phẩm'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Theo dõi thông tin và số lượng do doanh nghiệp đối tác cập nhật. Admin không trực tiếp quản lý tồn kho.
      </p>

      <form action="/admin/products" method="get" className="mt-5 flex flex-wrap gap-2">
        {partnerId && <input type="hidden" name="partner" value={partnerId} />}
        <label className="sr-only" htmlFor="product-search">Tìm sản phẩm hoặc doanh nghiệp</label>
        <input
          id="product-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Tìm tên sản phẩm hoặc doanh nghiệp"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:max-w-lg"
        />
        <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          Tìm kiếm
        </button>
        {query && (
          <Link
            href={partnerId ? `/admin/products?partner=${partnerId}` : '/admin/products'}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Xóa tìm kiếm
          </Link>
        )}
      </form>

      <div className="mt-5 space-y-3">
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
                  <p className="mt-1 text-sm text-slate-500">{partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}</p>
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
            {query ? 'Không tìm thấy sản phẩm phù hợp.' : 'Chưa có sản phẩm.'}
          </p>
        )}
      </div>
    </div>
  );
}
