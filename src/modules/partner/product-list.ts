export const productStatuses: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING: 'Chờ duyệt', APPROVED: 'Đang bán', REJECTED: 'Bị từ chối', UNLISTED: 'Đã gỡ',
};

export interface PartnerProduct {
  id: string;
  name: string;
  price: number | string;
  status: string;
  short_description: string | null;
  description: string | null;
  reject_reason: string | null;
  ocop_cert_no: string | null;
  product_categories: { name: string } | { name: string }[] | null;
  product_images: { url: string; sort_order: number }[];
  product_variants: { id: string; label: string; price: number | string }[];
  product_availability: { available_qty: number; reserved_qty: number; supply_status: string; pre_order_eta: string | null } | null;
}

export function categoryName(product: PartnerProduct) {
  return (Array.isArray(product.product_categories) ? product.product_categories[0]?.name : product.product_categories?.name) || 'Chưa phân loại';
}

export function productStatusTone(status: string) {
  if (status === 'APPROVED') return 'bg-[#eaf4ee] text-[#195c46]';
  if (status === 'PENDING') return 'bg-[#fcf3d9] text-[#9b7418]';
  if (status === 'REJECTED') return 'bg-[#fae9e7] text-[#cc4943]';
  return 'bg-slate-100 text-slate-600';
}
