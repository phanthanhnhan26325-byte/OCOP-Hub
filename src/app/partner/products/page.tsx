import Link from 'next/link';
import { requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { PartnerIcon } from '@/components/partner/PartnerIcon';
import { ProductDetails } from '@/components/partner/ProductDetails';
import { SubmitProductButton } from '@/components/partner/SubmitProductButton';
import { DeleteButton } from '@/components/partner/DeleteButton';
import { categoryName, productStatuses, productStatusTone, type PartnerProduct } from '@/modules/partner/product-list';

export const dynamic = 'force-dynamic';
type Filters = { q?: string | string[]; category?: string | string[]; status?: string | string[] };

export default async function PartnerProductsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await requireApprovedPartner();
  const db = await supabaseServer();
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const { data: categories, error: categoriesError } = await db.from('product_categories').select('id, name, status').order('name');
  if (categoriesError) throw new Error(categoriesError.message);
  const category = typeof params.category === 'string' && categories.some(item => item.id === params.category) ? params.category : '';
  const status = typeof params.status === 'string' && Object.hasOwn(productStatuses, params.status) ? params.status : '';
  const filtered = Boolean(q || category || status);

  const products: PartnerProduct[] = [];
  for (let from = 0; ; from += 500) {
    let query = db.from('products').select('id, name, price, status, short_description, description, reject_reason, ocop_cert_no, product_categories(name), product_availability(available_qty, reserved_qty, supply_status, pre_order_eta), product_images(url, sort_order), product_variants(id, label, price)').eq('partner_id', user.id).order('created_at', { ascending: false }).order('id');
    if (q) query = query.ilike('name', `%${q.replace(/[\\%_]/g, '\\$&')}%`);
    if (category) query = query.eq('category_id', category);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.range(from, from + 499);
    if (error) throw new Error(error.message);
    products.push(...data as unknown as PartnerProduct[]);
    if (data.length < 500) break;
  }

  return <div className="mx-auto max-w-[1568px] px-4 py-8 sm:px-6 sm:py-10">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><h1 className="text-2xl font-medium tracking-tight sm:text-[32px]">Quản lý sản phẩm</h1><p className="mt-2 text-sm leading-6 partner-muted">Theo dõi sản phẩm, trạng thái phê duyệt và thông tin cung ứng của doanh nghiệp.</p></div>
      <Link href="/partner/products/new" className="partner-action partner-action-primary"><PartnerIcon name="plus" />Thêm sản phẩm</Link>
    </div>

    <section aria-label="Danh sách sản phẩm" className="partner-panel mt-7 overflow-hidden">
      <form action="/partner/products" method="get" className="grid items-end gap-4 border-b border-[#eaf0ec] p-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:p-6">
        <label className="text-xs font-medium">Tìm sản phẩm
          <span className="relative mt-2 block"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="absolute left-3 top-3 h-4 w-4 text-[#738787]"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input name="q" type="search" defaultValue={q} maxLength={100} placeholder="Nhập tên sản phẩm…" className="w-full rounded-lg border border-[#dce6e1] bg-white py-2.5 pl-10 pr-3 text-sm font-normal" /></span>
        </label>
        <label className="text-xs font-medium">Danh mục
          <select name="category" defaultValue={category} className="mt-2 w-full rounded-lg border border-[#dce6e1] bg-white px-3 py-2.5 text-sm font-normal"><option value="">Tất cả danh mục</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}{item.status !== 'ACTIVE' ? ' (ngừng sử dụng)' : ''}</option>)}</select>
        </label>
        <label className="text-xs font-medium">Trạng thái
          <select name="status" defaultValue={status} className="mt-2 w-full rounded-lg border border-[#dce6e1] bg-white px-3 py-2.5 text-sm font-normal"><option value="">Tất cả trạng thái</option>{Object.entries(productStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <button type="submit" className="rounded-lg bg-[#195c46] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#124a37]">Tìm kiếm & lọc</button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs sm:px-6"><p className="partner-muted">{filtered ? 'Tìm thấy' : 'Tổng cộng'} <span className="font-semibold text-[#195c46]">{products.length}</span> sản phẩm{q ? ` cho “${q}”` : ''}</p>{filtered && <Link href="/partner/products" className="font-medium text-[#195c46] hover:underline">Xóa bộ lọc</Link>}</div>
      {products.length === 0 ? <div className="border-t border-[#eaf0ec] px-5 py-14 text-center"><span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="box" /></span><h2 className="text-base font-medium">{filtered ? 'Không tìm thấy sản phẩm phù hợp' : 'Chưa có sản phẩm nào'}</h2><p className="mt-2 text-sm partner-muted">{filtered ? 'Thử tên sản phẩm khác hoặc thay đổi bộ lọc.' : 'Thêm sản phẩm đầu tiên để bắt đầu giới thiệu sản phẩm của doanh nghiệp.'}</p><Link href={filtered ? '/partner/products' : '/partner/products/new'} className="partner-action mt-5">{filtered ? 'Xem tất cả sản phẩm' : 'Thêm sản phẩm'}</Link></div> :
        <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm">
          <caption className="sr-only">Danh sách sản phẩm của doanh nghiệp, mới nhất trước</caption>
          <thead className="border-y border-[#eaf0ec] bg-[#f7faf8] text-xs partner-muted"><tr>{['Sản phẩm', 'Danh mục', 'Giá bán', 'Cung ứng', 'Trạng thái', 'Thao tác'].map(heading => <th key={heading} scope="col" className="px-6 py-4 font-medium">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#eaf0ec]">{products.map(product => {
            const image = [...product.product_images].sort((a, b) => a.sort_order - b.sort_order)[0];
            const availability = product.product_availability;
            return <tr key={product.id} id={product.id} className="scroll-mt-28 transition hover:bg-[#f7faf8]">
              <td className="px-6 py-5"><div className="flex min-w-56 max-w-80 items-center gap-3">{image ? <img src={image.url} alt={product.name} className="h-16 w-16 shrink-0 rounded-xl border border-[#eaf0ec] object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#eaf4ee] text-[#195c46]"><PartnerIcon name="box" /></span>}<div className="min-w-0"><p className="font-semibold leading-5">{product.name}</p>{product.short_description && <p className="mt-1 line-clamp-2 text-xs leading-5 partner-muted">{product.short_description}</p>}{product.status === 'REJECTED' && product.reject_reason && <p className="mt-1 line-clamp-2 text-xs text-red-700">{product.reject_reason}</p>}</div></div></td>
              <td className="px-6 py-5 text-xs partner-muted">{categoryName(product)}</td>
              <td className="whitespace-nowrap px-6 py-5"><p className="font-semibold text-[#195c46]">{formatVnd(product.price)}</p>{product.product_variants.length > 0 && <p className="mt-1 text-[11px] partner-muted">{product.product_variants.length} biến thể</p>}</td>
              <td className="px-6 py-5"><p className="font-medium">{availability?.available_qty ?? 0}</p><p className="mt-1 whitespace-nowrap text-[11px] partner-muted">Đang giữ: {availability?.reserved_qty ?? 0}</p></td>
              <td className="px-6 py-5"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-medium ${productStatusTone(product.status)}`}><span aria-hidden="true">●</span>{productStatuses[product.status] ?? product.status}</span></td>
              <td className="px-6 py-5"><div className="flex flex-wrap items-start gap-2"><ProductDetails product={product} /><Link href={`/partner/products/${product.id}/edit`} className="rounded-lg border border-[#cdded5] px-3 py-1.5 text-xs font-medium text-[#195c46] hover:bg-[#eaf4ee]">Sửa</Link>{product.status === 'DRAFT' && <SubmitProductButton productId={product.id} />}<DeleteButton url={`/api/partner/products/${product.id}`} label="Xóa" /></div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>
  </div>;
}
