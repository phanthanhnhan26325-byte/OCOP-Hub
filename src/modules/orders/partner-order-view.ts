import type { ShippingAddress } from './shipping-address';

export const orderStatuses: Record<string, string> = {
  CREATED: 'Mới tạo', PAYMENT_PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán',
  PENDING_ACCEPTANCE: 'Chờ tiếp nhận', ACCEPTED: 'Đã tiếp nhận', PROCESSING: 'Đang chuẩn bị',
  SHIPPED: 'Đang giao', DELIVERED: 'Đã giao', COMPLETED: 'Hoàn thành', RETURNED: 'Đã nhận lại hàng',
  REJECTED_BY_PARTNER: 'Đã từ chối', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn', PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
};

export const paymentStatuses: Record<string, string> = {
  UNKNOWN: 'Chưa ghi nhận', CREATED: 'Chờ thanh toán', PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán',
  FAILED: 'Thanh toán thất bại', EXPIRED: 'Hết hạn', REFUNDED: 'Đã hoàn tiền',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần', CANCELLED: 'Đã hủy thanh toán',
};

export interface PartnerOrderItem {
  id: string; product_name: string; product_image: string | null;
  unit_price: number | string; qty: number; line_total: number | string;
}

export interface PartnerOrderRecord {
  id: string; parent_order_id: string | null; customer_id: string;
  code: string; status: string; total: number | string; subtotal: number | string;
  shipping_fee: number | string; discount: number | string; platform_fee: number | string;
  placed_at: string; updated_at: string; shipping_address: unknown; order_items: PartnerOrderItem[];
}

export interface OrderPayment {
  reference_id: string; status: string; provider: string; created_at: string;
  payment_transactions: { type: string; status: string; created_at: string }[];
}

export type PartnerOrder = Omit<PartnerOrderRecord, 'shipping_address'> & {
  shipping_address: ShippingAddress; parent_code: string | null; payment: OrderPayment | null;
};

export function chooseOrderPayment(payments: OrderPayment[]) {
  const paid = new Set(['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']);
  return [...payments].sort((a, b) => Number(paid.has(b.status)) - Number(paid.has(a.status)) || b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function orderStatusTone(status: string) {
  if (['PAID', 'DELIVERED', 'COMPLETED'].includes(status)) return 'bg-[#eaf4ee] text-[#195c46]';
  if (['ACCEPTED', 'PROCESSING', 'SHIPPED'].includes(status)) return 'bg-[#e8f1f6] text-[#286684]';
  if (['PENDING_ACCEPTANCE', 'PAYMENT_PENDING', 'PARTIALLY_REFUNDED'].includes(status)) return 'bg-[#fcf3d9] text-[#9b7418]';
  if (['REJECTED_BY_PARTNER', 'CANCELLED'].includes(status)) return 'bg-[#fae9e7] text-[#cc4943]';
  if (status === 'RETURNED') return 'bg-[#fcf3d9] text-[#9b7418]';
  return 'bg-slate-100 text-slate-600';
}

export function paymentStatusTone(status: string) {
  if (status === 'PAID') return 'bg-[#eaf4ee] text-[#195c46]';
  if (['CREATED', 'PENDING', 'PARTIALLY_REFUNDED'].includes(status)) return 'bg-[#fcf3d9] text-[#9b7418]';
  if (status === 'FAILED') return 'bg-[#fae9e7] text-[#cc4943]';
  return 'bg-slate-100 text-slate-600';
}

export function orderDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function filterPartnerOrders(orders: PartnerOrder[], filters: { q: string; days: string; status: string; payment: string }, now: Date) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi');
  const needle = normalize(filters.q.trim());
  const since = filters.days === 'all' ? null : now.getTime() - Number(filters.days) * 86400000;
  return orders.filter(order => {
    if (since !== null && new Date(order.placed_at).getTime() < since) return false;
    if (filters.status && order.status !== filters.status) return false;
    if (filters.payment && (order.payment?.status ?? 'UNKNOWN') !== filters.payment) return false;
    return !needle || [order.code, order.parent_code ?? '', order.shipping_address.receiver_name ?? '', order.shipping_address.phone ?? ''].some(value => normalize(value).includes(needle));
  });
}
