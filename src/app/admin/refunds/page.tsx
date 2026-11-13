import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { RefundForm } from '@/components/admin/RefundForm';
import { OrderServiceRefundQueue } from '@/components/admin/OrderServiceRefundQueue';

export const dynamic = 'force-dynamic';

export default async function AdminRefundsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const [
    { data: refunds, error: refundsError },
    { data: paidPayments, error: paymentsError },
    { data: pendingRequests, error: requestsError },
  ] = await Promise.all([
    supabase.from('refunds').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('payments').select('id, amount, refunded_amount, purpose, status').in('status', ['PAID', 'PARTIALLY_REFUNDED']).order('created_at', { ascending: false }).limit(50),
    supabase.from('order_service_requests')
      .select('id, order_id, partner_id, request_type, reason, refund_amount, payment_id, created_at')
      .eq('refund_status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(100),
  ]);
  if (refundsError) throw new Error(refundsError.message);
  if (paymentsError) throw new Error(paymentsError.message);
  if (requestsError) throw new Error(requestsError.message);

  const requestRows = pendingRequests ?? [];
  const paymentIds = [...new Set(requestRows.flatMap(request => request.payment_id ? [request.payment_id] : []))];
  const orderIds = [...new Set(requestRows.map(request => request.order_id))];
  const partnerIds = [...new Set(requestRows.map(request => request.partner_id))];
  const [{ data: requestPayments, error: requestPaymentsError }, { data: requestOrders, error: requestOrdersError }, { data: requestPartners, error: requestPartnersError }] = await Promise.all([
    paymentIds.length
      ? supabase.from('payments').select('id, status, business_sync_status').in('id', paymentIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase.from('orders').select('id, code').in('id', orderIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? supabase.from('partner_profiles').select('user_id, business_name').in('user_id', partnerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (requestPaymentsError) throw new Error(requestPaymentsError.message);
  if (requestOrdersError) throw new Error(requestOrdersError.message);
  if (requestPartnersError) throw new Error(requestPartnersError.message);
  const paymentById = new Map((requestPayments ?? []).map(payment => [payment.id, payment]));
  const orderById = new Map((requestOrders ?? []).map(order => [order.id, order]));
  const partnerById = new Map((requestPartners ?? []).map(partner => [partner.user_id, partner]));
  const refundQueue = requestRows.map(request => ({
    id: request.id,
    orderCode: orderById.get(request.order_id)?.code ?? request.order_id,
    partnerName: partnerById.get(request.partner_id)?.business_name ?? 'Doanh nghiệp',
    requestType: request.request_type as 'CANCELLATION' | 'RETURN',
    reason: request.reason,
    refundAmount: request.refund_amount,
    paymentStatus: paymentById.get(request.payment_id ?? '')?.status ?? 'UNKNOWN',
    syncStatus: paymentById.get(request.payment_id ?? '')?.business_sync_status ?? 'UNKNOWN',
    createdAt: request.created_at,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">Quản lý hủy/trả & hoàn tiền</h1>
      <OrderServiceRefundQueue requests={refundQueue} />
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Ghi nhận hoàn tiền thủ công</h2>
        <p className="mt-1 text-sm text-slate-500">Chuyển tiền ngoài hệ thống trước, sau đó nhập mã tham chiếu ngân hàng để ghi sổ. Trang này không kết nối cổng hoàn tiền.</p>
        <RefundForm payments={paidPayments ?? []} />
      </div>
      <h2 className="mt-8 font-semibold">Lịch sử hoàn tiền</h2>
      <div className="mt-3 space-y-2">
        {(refunds ?? []).map((r) => (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
            <span className="font-mono text-xs">{r.id.slice(0, 8)}</span> · {r.ref_type} {String(r.ref_id).slice(0, 8)} ·
            <b className="ml-1">{formatVnd(r.amount)}</b> · {r.status} · {formatDate(r.created_at)}
            {r.reason && <span className="text-slate-500"> · {r.reason}</span>}
          </div>
        ))}
        {(!refunds || refunds.length === 0) && <p className="text-slate-500">Chưa có hoàn tiền nào.</p>}
      </div>
    </div>
  );
}
