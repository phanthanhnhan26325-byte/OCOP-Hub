import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { ReviewControls } from '@/components/admin/ReviewControls';

export const dynamic = 'force-dynamic';

const productStatusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đang đăng bán',
  REJECTED: 'Bị từ chối',
  UNLISTED: 'Đã gỡ',
};

const recognizedOrderStatuses = [
  'COMPLETED',
  'DELIVERED',
  'SHIPPED',
  'PROCESSING',
  'ACCEPTED',
  'PENDING_ACCEPTANCE',
  'PAID',
];

interface ProductDetail {
  id: string;
  partner_id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  price: number | string;
  status: string;
  classifications: string[] | null;
  ocop_cert_no: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  product_categories: { name: string } | { name: string }[] | null;
  product_variants: { id: string; label: string; price: number | string }[] | null;
  product_availability: {
    available_qty: number;
    reserved_qty: number;
    supply_status: string;
    pre_order_eta: string | null;
    updated_at: string;
    updated_by: string | null;
  } | {
    available_qty: number;
    reserved_qty: number;
    supply_status: string;
    pre_order_eta: string | null;
    updated_at: string;
    updated_by: string | null;
  }[] | null;
  product_images: { url: string; alt: string | null; sort_order: number }[] | null;
  partner_profiles: { business_name: string } | { business_name: string }[] | null;
}

interface ProductOrderItem {
  qty: number;
  line_total: number | string;
  orders: { id: string; code: string; status: string; placed_at: string } | { id: string; code: string; status: string; placed_at: string }[];
}

interface AvailabilityChange {
  id: string;
  change_type: string;
  qty_before: number;
  qty_after: number;
  ref_type: string | null;
  ref_id: string | null;
  actor_id: string | null;
  created_at: string;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: productData, error: productError } = await supabase
    .from('products')
    .select('id, partner_id, name, slug, short_description, description, price, status, classifications, ocop_cert_no, reject_reason, created_at, updated_at, product_categories(name), product_variants(id, label, price), product_availability(available_qty, reserved_qty, supply_status, pre_order_eta, updated_at, updated_by), product_images(url, alt, sort_order), partner_profiles(business_name)')
    .eq('id', id)
    .maybeSingle();

  if (productError) throw new Error(productError.message);
  if (!productData) notFound();

  const product = productData as unknown as ProductDetail;
  const availability = firstRelation(product.product_availability);
  const partner = firstRelation(product.partner_profiles);
  const category = firstRelation(product.product_categories);
  const [
    { data: orderItemsData, error: orderItemsError },
    { data: historyData, error: historyError },
  ] = await Promise.all([
    supabase
      .from('order_items')
      .select('qty, line_total, orders!inner(id, code, status, placed_at)')
      .eq('product_id', product.id)
      .in('orders.status', recognizedOrderStatuses),
    supabase
      .from('product_availability_history')
      .select('id, change_type, qty_before, qty_after, ref_type, ref_id, actor_id, created_at')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (orderItemsError) throw new Error(orderItemsError.message);
  if (historyError) throw new Error(historyError.message);

  const orderItems = (orderItemsData ?? []) as unknown as ProductOrderItem[];
  const orderIds = new Set(
    orderItems.flatMap((item) => {
      const order = firstRelation(item.orders);
      return order ? [order.id] : [];
    }),
  );
  const quantitySold = orderItems.reduce((total, item) => total + item.qty, 0);
  const revenue = orderItems.reduce((total, item) => total + Number(item.line_total), 0);
  const history = (historyData ?? []) as AvailabilityChange[];
  const actorIds = [...new Set(history.map((entry) => entry.actor_id).filter((value): value is string => Boolean(value)))];
  let actorNames = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: actors, error: actorsError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', actorIds);
    if (actorsError) throw new Error(actorsError.message);
    actorNames = new Map((actors ?? []).map((actor) => [actor.id, actor.full_name || actor.email]));
  }

  const image = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  const availableToSell = Math.max(
    (availability?.available_qty ?? 0) - (availability?.reserved_qty ?? 0),
    0,
  );

  return (
    <div>
      <Link
        href={`/admin/products?partner=${product.partner_id}`}
        className="text-sm font-medium text-emerald-800 hover:underline"
      >
        ← Quay lại danh sách sản phẩm
      </Link>

      <article className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt={image.alt || product.name} className="h-48 w-full rounded-lg object-cover sm:w-48" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap justify-between gap-2">
              <h1 className="text-2xl font-bold">{product.name}</h1>
              <span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                {productStatusLabel[product.status] ?? product.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Doanh nghiệp: <Link href={`/admin/users/${product.partner_id}`} className="font-medium text-emerald-800 hover:underline">
                {partner?.business_name ?? 'Chưa có thông tin'}
              </Link>
            </p>
            <p className="mt-1 text-sm text-slate-500">Mã sản phẩm: {product.id} · Slug: /{product.slug}</p>
            <p className="mt-3 text-xl font-semibold text-emerald-800">{formatVnd(product.price)}</p>
            {product.short_description && <p className="mt-2 text-sm text-slate-600">{product.short_description}</p>}
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-500">Số lượng đã bán</dt><dd className="font-semibold">{quantitySold}</dd></div>
          <div><dt className="text-slate-500">Số đơn hàng</dt><dd className="font-semibold">{orderIds.size}</dd></div>
          <div><dt className="text-slate-500">Giá trị sản phẩm trong đơn</dt><dd className="font-semibold">{formatVnd(revenue)}</dd></div>
          <div><dt className="text-slate-500">Cập nhật gần nhất</dt><dd>{formatDate(availability?.updated_at ?? product.updated_at)}</dd></div>
        </dl>

        <section className="mt-5 border-t border-slate-100 pt-4">
          <h2 className="font-semibold">Số lượng do doanh nghiệp cập nhật</h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-500">Khai báo cung ứng</dt><dd>{availability?.available_qty ?? 0}</dd></div>
            <div><dt className="text-slate-500">Đã giữ cho đơn hàng</dt><dd>{availability?.reserved_qty ?? 0}</dd></div>
            <div><dt className="text-slate-500">Còn có thể bán</dt><dd>{availableToSell}</dd></div>
            <div><dt className="text-slate-500">Trạng thái cung ứng</dt><dd>{availability?.supply_status ?? 'Chưa khai báo'}</dd></div>
          </dl>
          {availability?.pre_order_eta && (
            <p className="mt-2 text-sm text-slate-600">Dự kiến có hàng: {availability.pre_order_eta}</p>
          )}
          {availability && (
            <p className="mt-1 text-xs text-slate-500">
              Cập nhật bởi {availability.updated_by ? actorNames.get(availability.updated_by) ?? availability.updated_by : 'doanh nghiệp'}
            </p>
          )}
        </section>

        {(category?.name || product.classifications?.length || product.ocop_cert_no) ? (
          <section className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="font-semibold">Phân loại và chứng nhận</h2>
            <p className="mt-2 text-sm text-slate-600">
              {category?.name}
              {product.classifications?.length ? ` · ${product.classifications.join(' · ')}` : ''}
              {product.ocop_cert_no ? ` · OCOP: ${product.ocop_cert_no}` : ''}
            </p>
          </section>
        ) : null}

        {product.product_variants && product.product_variants.length > 0 && (
          <section className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="font-semibold">Phiên bản sản phẩm</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {product.product_variants.map((variant) => (
                <li key={variant.id}>{variant.label} · {formatVnd(variant.price)}</li>
              ))}
            </ul>
          </section>
        )}

        {product.description && (
          <section className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="font-semibold">Mô tả chi tiết</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{product.description}</p>
          </section>
        )}
        {product.status === 'REJECTED' && product.reject_reason && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Lý do từ chối: {product.reject_reason}</p>
        )}
        {product.status === 'PENDING' && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <ReviewControls endpoint={`/api/admin/products/${product.id}/review`} />
          </div>
        )}
      </article>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Lịch sử cập nhật số lượng</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Cập nhật</th>
                <th className="px-4 py-3">Số lượng</th>
                <th className="px-4 py-3">Người cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-50">
                  <td className="px-4 py-3">{formatDate(entry.created_at)}</td>
                  <td className="px-4 py-3">{entry.change_type}</td>
                  <td className="px-4 py-3">{entry.qty_before} → {entry.qty_after}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {entry.actor_id ? actorNames.get(entry.actor_id) ?? entry.actor_id : 'Hệ thống'}
                    {entry.ref_type ? ` · ${entry.ref_type}` : ''}
                    {entry.ref_id ? ` ${entry.ref_id.slice(0, 8)}` : ''}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-5 text-center text-slate-500">Chưa có lịch sử cập nhật.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
