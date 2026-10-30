import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { z } from 'zod';

/** Admin tạo refund (REQUESTED → gọi cổng → COMPLETED). Ở bản này: ghi nhận hoàn tiền thực tế. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const body = z
      .object({
        paymentId: z.string().uuid(),
        amount: z.number().positive(),
        reason: z.string().min(3),
      })
      .safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();

    const { data: payment } = await supabase
      .from('payments')
      .select('id, amount, refunded_amount, status, purpose, reference_id')
      .eq('id', body.data.paymentId)
      .single();
    if (!payment || payment.status !== 'PAID') {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Chỉ hoàn tiền giao dịch đã thanh toán' } }, { status: 409 });
    }
    const remaining = Number(payment.amount) - Number(payment.refunded_amount);
    if (body.data.amount > remaining) {
      return NextResponse.json({ error: { code: 'AMOUNT_EXCEEDS', message: 'Số tiền hoàn vượt quá số còn lại' } }, { status: 400 });
    }

    const { getProvider } = await import('@/modules/payments/providers');
    const provider = await getProvider(payment.purpose === 'ORDER' ? 'mock' : 'mock');
    const refund = await provider.refund({
      paymentId: payment.id,
      providerTxnId: '',
      amount: body.data.amount,
      reason: body.data.reason,
    });

    // Ghi nhận hoàn tiền (chỉ khi có xác nhận hoàn thực tế)
    const { data: refundRow, error } = await supabase
      .from('refunds')
      .insert({
        payment_id: payment.id,
        ref_type: payment.purpose === 'ORDER' ? 'ORDER' : 'REGISTRATION',
        ref_id: payment.reference_id,
        amount: body.data.amount,
        reason: body.data.reason,
        status: 'COMPLETED',
        provider_refund_id: refund.providerRefundId,
        requested_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    const newRefunded = Number(payment.refunded_amount) + body.data.amount;
    await supabase
      .from('payments')
      .update({
        refunded_amount: newRefunded,
        status: newRefunded >= Number(payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', payment.id);

    // Nếu order → đặt sub-order về PARTIALLY_REFUNDED / CANCELLED
    if (payment.purpose === 'ORDER') {
      await supabase
        .from('orders')
        .update({ status: 'PARTIALLY_REFUNDED', updated_at: new Date().toISOString() })
        .eq('parent_order_id', payment.reference_id)
        .eq('status', 'REJECTED_BY_PARTNER');
    }

    await supabase.from('audit_logs').insert({
      actor_id: admin.id,
      actor_role: 'ADMIN',
      action: 'REFUND_COMPLETED',
      entity_type: 'payment',
      entity_id: payment.id,
      after: { amount: body.data.amount, refundId: refundRow?.id },
    });
    return NextResponse.json({ id: refundRow?.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Admin xem danh sách refunds. */
export async function GET() {
  try {
    await requireRole('ADMIN');
    const supabase = await supabaseServer();
    const { data } = await supabase.from('refunds').select('*').order('created_at', { ascending: false }).limit(200);
    return NextResponse.json({ refunds: data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}
