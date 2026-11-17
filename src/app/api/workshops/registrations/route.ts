import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';
import { ensurePayment } from '@/modules/orders/checkout.service';

const registerSchema = z.object({
  sessionId: z.string().uuid().optional(),
  registrationId: z.string().uuid().optional(),
}).refine(({ sessionId, registrationId }) => Boolean(sessionId) !== Boolean(registrationId));

/** Đăng ký workshop hoặc tạo lại link thanh toán cho một đăng ký đang chờ. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = registerSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });

    const supabase = await supabaseServer();
    let registration: {
      registration_id: string;
      code: string;
      amount: number;
      hold_expires_at: string | null;
    };
    let isNewRegistration = Boolean(body.data.sessionId);

    if (body.data.sessionId) {
      const { data, error } = await supabaseAdmin().rpc('register_workshop', {
        p_session: body.data.sessionId,
        p_customer: user.id,
      });
      if (error && !error.message.includes('ALREADY_REGISTERED')) throw new Error(error.message);
      if (error) {
        const { data: existing, error: existingError } = await supabase
          .from('workshop_registrations')
          .select('id, code, amount, status, hold_expires_at')
          .eq('session_id', body.data.sessionId)
          .eq('customer_id', user.id)
          .in('status', ['PENDING', 'PAYMENT_PROCESSING', 'CONFIRMED'])
          .maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (!existing) throw new Error(error.message);
        if (existing.status === 'CONFIRMED') {
          return NextResponse.json(
            { error: { code: 'ALREADY_REGISTERED', message: 'Bạn đã đăng ký buổi workshop này rồi.' } },
            { status: 409 },
          );
        }
        isNewRegistration = false;
        registration = {
          registration_id: existing.id,
          code: existing.code,
          amount: Number(existing.amount),
          hold_expires_at: existing.hold_expires_at,
        };
      } else {
        registration = data as typeof registration;
      }
    } else {
      const { data, error } = await supabase
        .from('workshop_registrations')
        .select('id, code, amount, status, hold_expires_at')
        .eq('id', body.data.registrationId!)
        .eq('customer_id', user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
      if (!['PENDING', 'PAYMENT_PROCESSING'].includes(data.status) || !data.hold_expires_at || new Date(data.hold_expires_at) <= new Date()) {
        return NextResponse.json(
          { error: { code: 'REGISTRATION_NOT_PAYABLE', message: 'Đăng ký này không còn trong thời hạn thanh toán.' } },
          { status: 409 },
        );
      }
      isNewRegistration = false;
      registration = {
        registration_id: data.id,
        code: data.code,
        amount: Number(data.amount),
        hold_expires_at: data.hold_expires_at,
      };
    }

    if (!registration.hold_expires_at || new Date(registration.hold_expires_at) <= new Date()) {
      return NextResponse.json(
        { error: { code: 'REGISTRATION_NOT_PAYABLE', message: 'Đăng ký này đã hết thời hạn thanh toán.' } },
        { status: 409 },
      );
    }

    if (Number(registration.amount) === 0) {
      const { data: confirmed, error: confirmationError } = await supabaseAdmin()
        .from('workshop_registrations')
        .update({ status: 'CONFIRMED', hold_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', registration.registration_id)
        .eq('customer_id', user.id)
        .eq('status', 'PENDING')
        .eq('amount', 0)
        .select('id')
        .maybeSingle();
      if (confirmationError) throw new Error(confirmationError.message);
      if (!confirmed) throw new Error('Không thể xác nhận đăng ký workshop miễn phí');
      const { env } = await import('@/lib/env');
      return NextResponse.json({
        registrationId: registration.registration_id,
        code: registration.code,
        redirectUrl: `${env.APP_URL}/profile`,
      }, { status: isNewRegistration ? 201 : 200 });
    }

    const payment = await ensurePayment({
      purpose: 'WORKSHOP_REGISTRATION',
      referenceId: registration.registration_id,
      customerId: user.id,
      amount: Number(registration.amount),
      expiresAt: registration.hold_expires_at,
    });

    const { getProvider } = await import('@/modules/payments/providers');
    const { env } = await import('@/lib/env');
    const provider = getProvider(payment.provider ?? 'mock');
    const created = await provider.create({
      paymentId: payment.id,
      amount: Number(registration.amount),
      orderCode: registration.code,
      returnUrl: `${env.APP_URL}/payment/result?paymentId=${payment.id}`,
    });

    const { error: transactionError } = await supabase.from('payment_transactions').insert({
      payment_id: payment.id,
      type: 'PAYMENT',
      provider: provider.name,
      provider_txn_id: created.providerTxnId,
      amount: Number(registration.amount),
      status: 'CREATED',
      response: { redirectUrl: created.redirectUrl },
    });
    if (transactionError) throw new Error(transactionError.message);

    return NextResponse.json(
      {
        registrationId: registration.registration_id,
        code: registration.code,
        paymentId: payment.id,
        redirectUrl: created.redirectUrl,
      },
      { status: isNewRegistration ? 201 : 200 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}

/** Hủy đăng ký. */
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth();
    const registrationId = new URL(req.url).searchParams.get('registrationId');
    if (!registrationId) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('cancel_registration_for_customer', {
      p_registration: registrationId,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
