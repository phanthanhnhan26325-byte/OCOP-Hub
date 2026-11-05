import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { ReviewControls } from '@/components/admin/ReviewControls';

export const dynamic = 'force-dynamic';

type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

const approvalStatusLabel: Record<ApprovalStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
};

const approvalStatusStyle: Record<ApprovalStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  APPROVED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
};

const soldOrderStatuses = [
  'COMPLETED',
  'DELIVERED',
  'SHIPPED',
  'PROCESSING',
  'ACCEPTED',
  'PENDING_ACCEPTANCE',
  'PAID',
];

interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  price: number | string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  reject_reason: string | null;
  partner_id: string;
  partner_profiles: { business_name: string } | { business_name: string }[] | null;
  product_availability: { available_qty: number; reserved_qty: number } | { available_qty: number; reserved_qty: number }[] | null;
  product_images: { url: string; alt: string | null; sort_order: number }[] | null;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string | string[]; q?: string | string[]; view?: string | string[]; status?: string | string[] }>;
}) {
  await requireRole('ADMIN');
  const params = await searchParams;
  const partnerId = typeof params.partner === 'string' ? params.partner : null;
  const query = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const approvalView = params.view === 'approval';
  const statusFilter =
    params.status === 'PENDING' ||
    params.status === 'APPROVED' ||
    params.status === 'REJECTED'
      ? params.status as ApprovalStatus
      : null;
  const supabase = await supabaseServer();

  const productSelection = 'id, name, slug, price, status, created_at, reviewed_at, reject_reason, partner_id, partner_profiles(business_name), product_availability(available_qty, reserved_qty), product_images(url, alt, sort_order)';
  let productsQuery = supabase
    .from('products')
    .select(productSelection)
    .order('created_at', { ascending: false });
  if (approvalView) {
    productsQuery = productsQuery
      .in('status', statusFilter ? [statusFilter] : ['PENDING', 'APPROVED', 'REJECTED'])
      .limit(10);
  } else {
    productsQuery = productsQuery.eq('status', 'APPROVED').limit(200);
  }

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
        .order('created_at', { ascending: false });
      if (approvalView) {
        partnerProductsQuery = partnerProductsQuery
          .in('status', statusFilter ? [statusFilter] : ['PENDING', 'APPROVED', 'REJECTED'])
          .limit(10);
      } else {
        partnerProductsQuery = partnerProductsQuery.eq('status', 'APPROVED').limit(200);
      }
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

  if (approvalView) {
    const priority: Record<ApprovalStatus, number> = { PENDING: 0, APPROVED: 1, REJECTED: 2 };
    const approvalProducts = products
      .filter((product) => product.status === 'PENDING' || product.status === 'APPROVED' || product.status === 'REJECTED')
      .sort((a, b) => {
        const statusDifference =
          priority[a.status as ApprovalStatus] - priority[b.status as ApprovalStatus];
        return statusDifference || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 10);
    const filterHref = (status: ApprovalStatus | null) => {
      const search = new URLSearchParams({ view: 'approval' });
      if (status) search.set('status', status);
      if (partnerId) search.set('partner', partnerId);
      if (query) search.set('q', query);
      return `/admin/products?${search.toString()}`;
    };

    return (
      <div>
        <h1 className="text-2xl font-bold">Phê duyệt sản phẩm</h1>
        <p className="mt-1 text-sm text-slate-500">
          Tối đa 10 sản phẩm gần nhất. Sản phẩm chờ duyệt được ưu tiên hiển thị trước.
        </p>

        <nav aria-label="Lọc sản phẩm theo trạng thái" className="mt-5 flex flex-wrap gap-2">
          {([
            { label: 'Tất cả', status: null },
            { label: 'Chờ duyệt', status: 'PENDING' },
            { label: 'Đã phê duyệt', status: 'APPROVED' },
            { label: 'Đã từ chối', status: 'REJECTED' },
          ] as const).map(({ label, status }) => {
            const active = statusFilter === status;
            return (
              <Link
                key={label}
                href={filterHref(status)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  active
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-800'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <form action="/admin/products" method="get" className="mt-5 flex flex-wrap gap-2">
          <input type="hidden" name="view" value="approval" />
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
              href={filterHref(statusFilter)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Xóa tìm kiếm
            </Link>
          )}
        </form>

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Sản phẩm / doanh nghiệp</th>
                <th className="px-4 py-3">Giá / số lượng</th>
                <th className="px-4 py-3">Ngày gửi</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Ngày duyệt</th>
                <th className="px-4 py-3">Lý do từ chối</th>
                <th className="px-4 py-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {approvalProducts.map((product) => {
                const partner = firstRelation(product.partner_profiles);
                const availability = firstRelation(product.product_availability);
                const status = product.status as ApprovalStatus;
                return (
                  <tr key={product.id} className="border-b border-slate-50 align-top hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link href={`/admin/products/${product.id}`} className="font-medium text-emerald-900 hover:underline">
                        {product.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{formatVnd(product.price)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Khai báo: {availability?.available_qty ?? 0}
                        {availability ? ` · Đã giữ ${availability.reserved_qty}` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(product.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${approvalStatusStyle[status]}`}>
                        {approvalStatusLabel[status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {product.reviewed_at ? formatDate(product.reviewed_at) : '—'}
                    </td>
                    <td className="max-w-56 px-4 py-3 text-slate-600">{product.reject_reason || '—'}</td>
                    <td className="px-4 py-3">
                      {status === 'PENDING' ? (
                        <ReviewControls endpoint={`/api/admin/products/${product.id}/review`} />
                      ) : (
                        <Link href={`/admin/products/${product.id}`} className="font-medium text-emerald-800 hover:underline">
                          Xem chi tiết
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {approvalProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {statusFilter
                      ? `Không có sản phẩm ${approvalStatusLabel[statusFilter].toLocaleLowerCase('vi-VN')}.`
                      : query
                        ? 'Không tìm thấy sản phẩm phù hợp.'
                        : 'Chưa có sản phẩm cần phê duyệt hoặc đã được xử lý.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const productIds = products.map((product) => product.id);
  const [orderItemsResult, initialStockByProduct] = productIds.length > 0
    ? await Promise.all([
        supabase
          .from('order_items')
          .select('product_id, qty, orders!inner(status)')
          .in('product_id', productIds)
          .in('orders.status', soldOrderStatuses),
        (async () => {
          const initialStock = new Map<string, number>();
          const pageSize = 1000;
          let offset = 0;

          while (true) {
            const { data, error } = await supabase
              .from('product_availability_history')
              .select('product_id, qty_after')
              .in('product_id', productIds)
              .eq('change_type', 'DECLARED')
              .order('created_at', { ascending: true })
              .range(offset, offset + pageSize - 1);
            if (error) throw new Error(error.message);

            for (const entry of data ?? []) {
              if (!initialStock.has(entry.product_id)) {
                initialStock.set(entry.product_id, entry.qty_after);
              }
            }

            if (!data || data.length < pageSize) break;
            offset += pageSize;
          }

          return initialStock;
        })(),
      ])
    : [null, new Map<string, number>()];
  if (orderItemsResult?.error) throw new Error(orderItemsResult.error.message);

  const soldByProduct = new Map<string, number>();
  for (const item of (orderItemsResult?.data ?? []) as { product_id: string; qty: number }[]) {
    soldByProduct.set(item.product_id, (soldByProduct.get(item.product_id) ?? 0) + item.qty);
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
        Chỉ hiển thị sản phẩm đang hoạt động đã được phê duyệt. Chọn tên sản phẩm để xem thông tin chi tiết.
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

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3">Hình ảnh</th>
              <th className="px-4 py-3">Tên sản phẩm</th>
              <th className="px-4 py-3">Doanh nghiệp cung cấp</th>
              <th className="px-4 py-3">Đơn giá</th>
              <th className="px-4 py-3">Số lượng ban đầu</th>
              <th className="px-4 py-3">Số lượng đã bán</th>
              <th className="px-4 py-3">Còn lại trong kho</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const partner = firstRelation(product.partner_profiles);
              const availability = firstRelation(product.product_availability);
              const image = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
              return (
                <tr key={product.id} className="border-b border-slate-50 align-middle hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/products/${product.id}`}
                      aria-label={`Xem chi tiết ${product.name}`}
                      className="block w-fit"
                    >
                      {image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image.url}
                          alt={image.alt || product.name}
                          className="h-14 w-14 rounded-lg border border-slate-100 object-cover"
                        />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                          Chưa có ảnh
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="font-medium text-emerald-900 hover:underline"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${product.partner_id}`}
                      className="font-medium text-emerald-800 hover:underline"
                    >
                      {partner?.business_name ?? 'Chưa có thông tin doanh nghiệp'}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatVnd(product.price)}</td>
                  <td className="px-4 py-3">
                    {initialStockByProduct.get(product.id) ?? '—'}
                  </td>
                  <td className="px-4 py-3">{soldByProduct.get(product.id) ?? 0}</td>
                  <td className="px-4 py-3 font-medium">
                    {availability?.available_qty ?? 0}
                  </td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {query
                    ? 'Không tìm thấy sản phẩm đang hoạt động phù hợp.'
                    : 'Chưa có sản phẩm nào được phê duyệt bán hàng.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
