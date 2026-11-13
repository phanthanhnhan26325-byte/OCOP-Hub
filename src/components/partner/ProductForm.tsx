'use client';

import { useState, useTransition } from 'react';
import type { ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const PRODUCT_IMAGE_BUCKET = 'ocop-product-images-v1';
const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const imageExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
interface ProductVariantAvailability {
  available_qty: number;
  supply_status: string;
  pre_order_eta: string | null;
}

interface ProductVariantInput {
  id?: string;
  label: string;
  price: number;
  product_variant_availability?: ProductVariantAvailability | ProductVariantAvailability[] | null;
}

interface VariantFormRow {
  id?: string;
  label: string;
  price: number;
  availableQty: number;
  supplyStatus: string;
  preOrderEta: string;
}

function toVariantRow(variant: ProductVariantInput): VariantFormRow {
  const relation = variant.product_variant_availability;
  const availability = Array.isArray(relation) ? relation[0] ?? null : relation;
  return {
    id: variant.id,
    label: variant.label,
    price: Number(variant.price),
    availableQty: availability?.available_qty ?? 0,
    supplyStatus: availability?.supply_status ?? 'IN_STOCK',
    preOrderEta: availability?.pre_order_eta ?? '',
  };
}

function variantSnapshot(rows: VariantFormRow[]) {
  return rows.map((variant) => ({
    id: variant.id,
    label: variant.label.trim(),
    price: Number(variant.price),
    availableQty: Number(variant.availableQty),
    supplyStatus: variant.supplyStatus,
    preOrderEta: variant.supplyStatus === 'PRE_ORDER' ? variant.preOrderEta : '',
  })).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
}

export interface EditableProduct {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  price: number;
  category_id: string | null;
  ocop_cert_no: string | null;
  product_images: { url: string; sort_order: number }[];
  product_variants: ProductVariantInput[];
}

interface ProductFormProps {
  categories: { id: string; name: string }[];
  partnerId: string;
  product?: EditableProduct;
}

export function ProductForm(props: ProductFormProps) {
  // Initialize a fresh editing session when server data or the selected product changes.
  // useState initial values alone do not replace a previously mounted blank form.
  return <ProductFormFields key={JSON.stringify(props.product ?? null)} {...props} />;
}

function ProductFormFields({
  categories,
  partnerId,
  product,
}: ProductFormProps) {
  const [form, setForm] = useState({
    name: product?.name ?? '', slug: product?.slug ?? '',
    shortDescription: product?.short_description ?? '', description: product?.description ?? '', price: product?.price ?? 0,
    categoryId: product?.category_id ?? '', ocopCertNo: product?.ocop_cert_no ?? '',
  });
  const [existingImages, setExistingImages] = useState(() =>
    [...(product?.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(image => image.url));
  const [images, setImages] = useState<File[]>([]);
  const [variants, setVariants] = useState<VariantFormRow[]>(() => (product?.product_variants ?? []).map(toVariantRow));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function autoSlug(name: string) {
    return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function selectImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selected.length + existingImages.length > MAX_IMAGES) {
      setMsg(`Chỉ được tải tối đa ${MAX_IMAGES} ảnh.`);
      return;
    }
    const invalidImage = selected.find((file) => !imageExtensions[file.type]);
    if (invalidImage) {
      setMsg('Ảnh sản phẩm chỉ chấp nhận định dạng PNG hoặc JPG.');
      return;
    }
    const oversizedImage = selected.find((file) => file.size > MAX_IMAGE_SIZE);
    if (oversizedImage) {
      setMsg(`Mỗi ảnh không được lớn hơn ${MAX_IMAGE_SIZE / 1024 / 1024} MB.`);
      return;
    }
    setImages(selected);
    setMsg(null);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (product && images.length === 0 &&
          form.name === product.name && (form.slug || autoSlug(form.name)) === product.slug &&
          form.shortDescription === (product.short_description ?? '') && form.description === (product.description ?? '') &&
          form.categoryId === (product.category_id ?? '') && form.ocopCertNo === (product.ocop_cert_no ?? '') &&
          Number(variants.length ? Math.min(...variants.map(v => v.price)) : form.price) === Number(product.price) &&
          JSON.stringify(existingImages) === JSON.stringify([...product.product_images].sort((a, b) => a.sort_order - b.sort_order).map(image => image.url)) &&
          JSON.stringify(variantSnapshot(variants)) === JSON.stringify(variantSnapshot(product.product_variants.map(toVariantRow)))) {
          setMsg('Bạn chưa thay đổi thông tin sản phẩm. Không cần gửi duyệt lại.');
          return;
        }
        if (images.length + existingImages.length < 1 || images.length + existingImages.length > MAX_IMAGES) {
          setMsg(`Vui lòng chọn từ 1 đến ${MAX_IMAGES} ảnh sản phẩm.`);
          return;
        }
        if (variants.some((variant) => !variant.label.trim() || variant.price <= 0)) {
          setMsg('Mỗi biến thể cần có khối lượng và giá lớn hơn 0.');
          return;
        }
        const variantLabels = variants.map((variant) => variant.label.trim().toLocaleLowerCase('vi'));
        if (new Set(variantLabels).size !== variantLabels.length) {
          setMsg('Khối lượng của các biến thể không được trùng nhau.');
          return;
        }
        if (variants.some((variant) => !Number.isInteger(Number(variant.availableQty)) || Number(variant.availableQty) < 0)) {
          setMsg('Số lượng cung ứng của mỗi biến thể phải là số nguyên không âm.');
          return;
        }
        if (variants.some((variant) => variant.supplyStatus === 'OUT_OF_STOCK' && Number(variant.availableQty) !== 0)) {
          setMsg('Số lượng cung ứng phải bằng 0 khi biến thể hết hàng.');
          return;
        }
        if (variants.some((variant) => variant.supplyStatus === 'PRE_ORDER' && !variant.preOrderEta)) {
          setMsg('Vui lòng chọn ngày dự kiến có hàng cho biến thể nhận đặt trước.');
          return;
        }
        startTransition(async () => {
          const supabase = supabaseBrowser();
          const uploadedPaths: string[] = [];
          try {
            setMsg(images.length ? 'Đang tải ảnh sản phẩm lên...' : 'Đang lưu thông tin và gửi duyệt...');
            const imageUrls: string[] = [...existingImages];
            for (const [index, image] of images.entries()) {
              const path = `${partnerId}/${crypto.randomUUID()}.${imageExtensions[image.type]}`;
              const { data: uploaded, error: uploadError } = await supabase.storage
                .from(PRODUCT_IMAGE_BUCKET)
                .upload(path, image, { contentType: image.type, cacheControl: '31536000', upsert: false });
              if (uploadError) {
                throw new Error(`Tải ảnh "${image.name}" thất bại: ${uploadError.message}`);
              }
              uploadedPaths.push(uploaded.path);
              imageUrls.push(supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(uploaded.path).data.publicUrl);
              setMsg(`Đang tải ảnh ${index + 1}/${images.length}...`);
            }

            const res = await fetch(product ? `/api/partner/products/${product.id}` : '/api/partner/products', {
              method: product ? 'PATCH' : 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: form.name,
                slug: form.slug || autoSlug(form.name),
                shortDescription: form.shortDescription,
                description: form.description,
                price: variants.length ? Math.min(...variants.map((variant) => variant.price)) : form.price,
                categoryId: form.categoryId || null,
                variants: variants.map((variant) => ({
                  id: variant.id,
                  label: variant.label.trim(),
                  price: variant.price,
                  availableQty: Number(variant.availableQty),
                  supplyStatus: variant.supplyStatus,
                  preOrderEta: variant.supplyStatus === 'PRE_ORDER' ? variant.preOrderEta : null,
                })),
                ocopCertNo: form.ocopCertNo,
                images: imageUrls,
                ...(product ? { action: 'submit' } : {}),
              }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error?.message ?? 'Gửi duyệt sản phẩm thất bại');
            setMsg('Đã gửi sản phẩm thành công. Vui lòng chờ admin phê duyệt.');
            router.push(`/partner/products#${product?.id ?? data.id}`);
            router.refresh();
          } catch (error) {
            if (uploadedPaths.length > 0) {
              const { error: cleanupError } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(uploadedPaths);
              if (cleanupError) {
                setMsg(`${error instanceof Error ? error.message : 'Tạo sản phẩm thất bại'}; không thể dọn ảnh đã tải lên: ${cleanupError.message}`);
                return;
              }
            }
            setMsg(error instanceof Error ? error.message : 'Tạo sản phẩm thất bại');
          }
        });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Tên sản phẩm *
          <input required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value, slug: autoSlug(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="text-sm">Slug (URL)
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
        <label className="text-sm">Giá bán (VNĐ) {variants.length ? '(giá thấp nhất theo biến thể)' : '*'}
          <input type="number" required={!variants.length} min={1} value={variants.length ? Math.min(...variants.map((variant) => variant.price)) : form.price || ''}
            disabled={variants.length > 0}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-100" />
        </label>
        <label className="text-sm">Danh mục sản phẩm *
          <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2">
            <option value="">— Chọn danh mục —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2">
          Khi sản phẩm có biến thể, doanh nghiệp khai báo số lượng cung ứng và trạng thái cho từng biến thể.
          Sản phẩm không có biến thể dùng nút “Cập nhật số lượng” ở danh sách sản phẩm.
        </p>
        <fieldset className="space-y-2 text-sm sm:col-span-2">
          <legend className="font-medium">Biến thể khối lượng (không bắt buộc)</legend>
          <p className="text-xs text-slate-500">Tự nhập khối lượng, giá và thông tin cung ứng cho từng lựa chọn, ví dụ 250 g, 500 g, 1 kg.</p>
          {variants.map((variant, index) => (
            <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label>
                  Khối lượng
                  <input
                    required
                    value={variant.label}
                    onChange={(event) => setVariants((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, label: event.target.value } : item,
                    ))}
                    placeholder="Ví dụ: 500 g"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <label>
                  Giá (VNĐ)
                  <input
                    type="number"
                    required
                    min={1}
                    value={variant.price || ''}
                    onChange={(event) => setVariants((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, price: Number(event.target.value) } : item,
                    ))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  className="self-end rounded-lg border border-red-200 px-3 py-2 text-red-600 hover:bg-red-50"
                >
                  Xóa
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label>
                  Số lượng cung ứng
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    value={variant.availableQty}
                    disabled={variant.supplyStatus === 'OUT_OF_STOCK'}
                    onChange={(event) => setVariants((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, availableQty: Number(event.target.value) } : item,
                    ))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
                <label>
                  Trạng thái cung ứng
                  <select
                    value={variant.supplyStatus}
                    onChange={(event) => {
                      const nextStatus = event.target.value;
                      setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? {
                        ...item,
                        supplyStatus: nextStatus,
                        availableQty: nextStatus === 'OUT_OF_STOCK' ? 0 : item.availableQty,
                        preOrderEta: nextStatus === 'PRE_ORDER' ? item.preOrderEta : '',
                      } : item));
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    <option value="IN_STOCK">Đang có hàng</option>
                    <option value="OUT_OF_STOCK">Hết hàng</option>
                    <option value="PRE_ORDER">Nhận đặt trước</option>
                  </select>
                </label>
                <label>
                  Ngày dự kiến có hàng
                  <input
                    type="date"
                    required={variant.supplyStatus === 'PRE_ORDER'}
                    disabled={variant.supplyStatus !== 'PRE_ORDER'}
                    value={variant.preOrderEta}
                    onChange={(event) => setVariants((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, preOrderEta: event.target.value } : item,
                    ))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 disabled:bg-slate-100"
                  />
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setVariants((current) => [...current, { label: '', price: 0, availableQty: 0, supplyStatus: 'IN_STOCK', preOrderEta: '' }])}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            + Thêm biến thể khối lượng
          </button>
        </fieldset>
        <label className="text-sm">Ảnh sản phẩm * (PNG hoặc JPG, từ 1 đến {MAX_IMAGES} ảnh)
          <input
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            multiple
            onChange={selectImages}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-slate-500">
            {existingImages.length + images.length}/{MAX_IMAGES} ảnh đã chọn · tối đa {MAX_IMAGE_SIZE / 1024 / 1024} MB mỗi ảnh
          </span>
        </label>
        {existingImages.length > 0 && <ul className="flex flex-wrap gap-3 sm:col-span-2" aria-label="Ảnh sản phẩm hiện tại">
          {existingImages.map((url, index) => <li key={`${url}-${index}`} className="space-y-1">
            <img src={url} alt={`Ảnh sản phẩm ${index + 1}`} className="h-24 w-24 rounded-lg border object-cover" />
            <button type="button" onClick={() => setExistingImages(current => current.filter((_, i) => i !== index))} className="text-xs text-red-600">Xóa ảnh {index + 1}</button>
          </li>)}
        </ul>}
        {images.length > 0 && (
          <ul className="flex flex-wrap gap-2 sm:col-span-2" aria-label="Ảnh đã chọn">
            {images.map((image, index) => (
              <li key={`${image.name}-${image.lastModified}-${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="max-w-48 truncate">{image.name}</span>
                <button
                  type="button"
                  aria-label={`Xóa ảnh ${image.name}`}
                  onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}
                  className="font-semibold text-red-600 hover:text-red-800"
                >
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="text-sm">Số chứng nhận OCOP
          <input value={form.ocopCertNo} onChange={(e) => setForm({ ...form, ocopCertNo: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm">Mô tả ngắn
        <input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      <label className="block text-sm">Mô tả chi tiết
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2" />
      </label>
      {msg && <p role="status" aria-live="polite" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{msg}</p>}
      <button disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? 'Đang gửi...' : product ? 'Lưu thay đổi và gửi duyệt lại' : 'Gửi sản phẩm chờ phê duyệt'}
      </button>
    </form>
  );
}
