import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
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
  const supabase = await supabaseServer();
  const { data: payment } = paymentId
    ? await supabase.from('payments').select('id, amount, status, purpose, reference_id, business_sync_status, orders(code, status)').eq('id', paymentId).maybeSingle()
    : { data: null };

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {!payment ? (
        <p className="text-slate-500">Không tìm thấy giao dịch.</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-bold">Kết quả thanh toán</h1>
          <p className={`mt-3 text-lg font-semibold ${payment.status === 'PAID' ? 'text-emerald-700' : 'text-amber-600'}`}>
            {statusLabel[payment.status] ?? payment.status}
          </p>
          <p className="mt-2 text-slate-600">Số tiền: {formatVnd(payment.amount)}</p>
          <p className="text-sm text-slate-500">Mã giao dịch: {payment.id}</p>
          <p className="text-xs text-slate-400">
            Trạng thái được xác nhận từ webhook của cổng thanh toán, không dựa trên redirect.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/orders" className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700">
              Xem đơn hàng
            </Link>
            <Link href="/" className="rounded-lg border border-slate-200 px-4 py-2 hover:bg-slate-50">
              Trang chủ
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
