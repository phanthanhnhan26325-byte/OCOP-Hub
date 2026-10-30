import { supabaseServer } from '@/lib/supabase/server';
import { formatVnd } from '@/lib/money';
import { MockPayForm } from '@/components/payments/MockPayForm';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Trang mô phỏng cổng thanh toán (mock). Sẽ thay bằng redirect thật khi chọn gateway. */
export default async function MockPayPage({ params, searchParams }: PageProps<'/pay/mock/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  const txn = typeof sp.txn === 'string' ? sp.txn : '';
  const supabase = await supabaseServer();
  const { data: payment } = await supabase
    .from('payments')
    .select('id, amount, status, purpose, provider')
    .eq('id', id)
    .single();
  if (!payment) notFound();

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-400">Cổng thanh toán (mock sandbox)</p>
        <h1 className="mt-1 text-xl font-bold">Thanh toán {formatVnd(payment.amount)}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {payment.purpose === 'ORDER' ? 'Đơn mua hàng' : 'Đăng ký workshop'} · {payment.id}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Đây là môi trường mô phỏng. Khi chọn cổng thanh toán thật (VNPay/MoMo/...), bạn sẽ được chuyển tới trang của nhà cung cấp.
        </p>
        <MockPayForm paymentId={payment.id} amount={Number(payment.amount)} txn={txn} disabled={payment.status === 'PAID'} />
      </div>
    </div>
  );
}
