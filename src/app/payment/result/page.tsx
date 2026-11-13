import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { getSessionUser } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, string> = {
  CREATED: 'Mới tạo',
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  EXPIRED: 'Hết hạn',
  REFUNDED: 'Đã hoàn tiền',
  PARTIALLY_REFUNDED: 'Hoàn một phần',
  CANCELLED: 'Đã hủy',
};

export default async function PaymentResultPage({ searchParams }: PageProps<'/payment/result'>) {
  const sp = await searchParams;
  const paymentId = typeof sp.paymentId === 'string' ? sp.paymentId : '';
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/payment/result?paymentId=${paymentId}`)}`);

  const supabase = await supabaseServer();
  const { data: payment, error: paymentError } = paymentId
    ? await supabase
      .from('payments')
      .select('id, amount, status, purpose, reference_id')
      .eq('id', paymentId)
      .eq('customer_id', user.id)
      .maybeSingle()
    : { data: null, error: null };
  if (paymentError) throw new Error(paymentError.message);

  const { data: order, error: orderError } = payment?.purpose === 'ORDER'
    ? await supabase
      .from('orders')
      .select('id, code')
      .eq('id', payment.reference_id)
      .eq('customer_id', user.id)
      .eq('order_level', 'PARENT')
      .maybeSingle()
    : { data: null, error: null };
  if (orderError) throw new Error(orderError.message);
  const paymentSuccessful = payment?.status === 'PAID';

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {!payment ? (
        <p className="text-slate-500">Không tìm thấy giao dịch.</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-bold">{paymentSuccessful ? 'Thanh toán thành công' : 'Kết quả thanh toán'}</h1>
          <p className={`mt-3 text-lg font-semibold ${payment.status === 'PAID' ? 'text-emerald-700' : 'text-amber-600'}`}>
            {statusLabel[payment.status] ?? payment.status}
          </p>
          {paymentSuccessful && order && (
            <p className="mt-2 text-sm text-slate-600">Đơn hàng {order.code} đã được thanh toán.</p>
          )}
          <p className="mt-2 text-slate-600">Số tiền: {formatVnd(payment.amount)}</p>
          <p className="text-sm text-slate-500">Mã giao dịch: {payment.id}</p>
          <p className="text-xs text-slate-400">
            Trạng thái được xác nhận từ webhook của cổng thanh toán, không dựa trên redirect.
          </p>
          {paymentSuccessful && order ? (
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={`/profile?orderId=${encodeURIComponent(order.id)}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">
                Xem thông tin đơn hàng
              </Link>
              <Link href="/" className="rounded-lg border border-slate-200 px-4 py-2 hover:bg-slate-50">
                Quay lại trang chủ
              </Link>
            </div>
          ) : (
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/orders" className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">
                Xem đơn hàng
              </Link>
              <Link href="/" className="rounded-lg border border-slate-200 px-4 py-2 hover:bg-slate-50">
                Trang chủ
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
