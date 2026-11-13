import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/rbac';
import { AddToCartButton } from '@/components/customer/AddToCartButton';
import { ReviewsSection, type PublicReview, type ReviewPurchase, type ReviewStats } from '@/components/customer/ReviewsSection';
import { productDescription } from '@/lib/product-description';
import { isMissingReviewSchema } from '@/modules/reviews/schema';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: product, error } = await supabase
    .from('products')
    .select(
      'id, name, slug, price, short_description, description, classifications, product_categories(name), product_variants(id, label, price, product_variant_availability(available_qty, supply_status, pre_order_eta)), ocop_cert_no, status, product_images(url, sort_order), product_availability(available_qty, reserved_qty, supply_status, pre_order_eta), partner_id, partner_profiles(business_name, address, contact_phone)',
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
  const description = productDescription(product.short_description, product.description);
  const user = await getSessionUser();
  let reviewsAvailable = true;
  let publicReviews: PublicReview[] = [];
  let reviewStats: ReviewStats | null = null;
  const reviewsResult = await supabase
    .from('product_reviews_public')
    .select('id, display_name, rating, comment, created_at, updated_at')
    .eq('product_id', product.id)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (reviewsResult.error && isMissingReviewSchema(reviewsResult.error)) {
    reviewsAvailable = false;
    console.error('[product:reviews-schema]', reviewsResult.error.message);
  } else if (reviewsResult.error) {
    throw new Error(reviewsResult.error.message);
  } else {
    publicReviews = (reviewsResult.data ?? []) as PublicReview[];
    const statsResult = await supabase
      .from('product_review_stats')
      .select('review_count, average_rating, one_star, two_stars, three_stars, four_stars, five_stars')
      .eq('product_id', product.id)
      .maybeSingle();
    if (statsResult.error && isMissingReviewSchema(statsResult.error)) {
      reviewsAvailable = false;
      console.error('[product:reviews-schema]', statsResult.error.message);
    } else if (statsResult.error) {
      throw new Error(statsResult.error.message);
    } else {
      reviewStats = statsResult.data as ReviewStats | null;
    }
  }

  let reviewPurchases: ReviewPurchase[] = [];
  if (reviewsAvailable && user?.roles.includes('CUSTOMER')) {
    const admin = supabaseAdmin();
    const { data: items, error: itemsError } = await admin
      .from('order_items')
      .select('id, orders!inner(code, placed_at, customer_id, status, order_level)')
      .eq('product_id', product.id)
      .eq('orders.customer_id', user.id)
      .eq('orders.order_level', 'CHILD')
      .in('orders.status', ['DELIVERED', 'COMPLETED']);
    if (itemsError) throw new Error(itemsError.message);
    const eligibleItems = (items ?? []) as unknown as Array<{
      id: string;
      orders: { code: string; placed_at: string } | { code: string; placed_at: string }[];
    }>;
    const itemIds = eligibleItems.map((item) => item.id);
    const { data: existingReviews, error: existingReviewsError } = itemIds.length
      ? await admin.from('product_reviews').select('id, order_item_id, rating, comment').in('order_item_id', itemIds)
      : { data: [], error: null };
    if (existingReviewsError) throw new Error(existingReviewsError.message);
    const reviewsByItem = new Map((existingReviews ?? []).map((review) => [review.order_item_id, review]));
    reviewPurchases = eligibleItems.map((item) => {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
      const review = reviewsByItem.get(item.id);
      return {
        id: item.id,
        label: order ? `Đơn ${order.code} · ${new Date(order.placed_at).toLocaleDateString('vi-VN')}` : 'Đơn hàng đã hoàn tất',
        review: review ? { id: review.id, rating: review.rating, comment: review.comment } : null,
      };
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.product_images?.[0]?.url ?? 'https://placehold.co/600x600?text=OCOP'}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-emerald-700">OCOP · {partner?.business_name}</p>
          <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
          {classification && (
            <span className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              {classification}
            </span>
          )}
          <AddToCartButton key={product.id} productId={product.id} price={product.price} max={Math.max(remaining, 1)} variants={product.product_variants} canPurchase={remaining > 0 || avail?.supply_status === 'PRE_ORDER'}>
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
              {description && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <h2 className="font-semibold text-slate-800">Thông tin sản phẩm</h2>
                  <p className="mt-1 break-words leading-relaxed text-slate-600">{description}</p>
                </div>
              )}
              {product.ocop_cert_no && <p className="mt-1 text-slate-500">Chứng nhận OCOP: {product.ocop_cert_no}</p>}
            </div>
          </AddToCartButton>
        </div>
      </div>

      <ReviewsSection
        type="product"
        targetId={product.id}
        available={reviewsAvailable}
        reviews={publicReviews}
        stats={reviewStats ?? {
          review_count: 0, average_rating: 0, one_star: 0, two_stars: 0, three_stars: 0, four_stars: 0, five_stars: 0,
        }}
        purchases={reviewPurchases}
      />
    </div>
  );
}
