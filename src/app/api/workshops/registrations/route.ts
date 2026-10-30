import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { z } from 'zod';

const registerSchema = z.object({ sessionId: z.string().uuid() });

/** Đăng ký 1 buổi workshop (atomic qua RPC — giữ chỗ + tạo registration). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = registerSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });

    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('register_workshop', {
      p_session: body.data.sessionId,
      p_customer: user.id,
    });
    if (error) throw new Error(error.message);

    const reg = data as { registration_id: string; code: string; amount: number; hold_expires_at: string };
    // Tạo payment
    const { data: payment } = await supabase
      .from('payments')
      .insert({
        purpose: 'WORKSHOP_REGISTRATION',
        reference_id: reg.registration_id,
        customer_id: user.id,
        amount: reg.amount,
        status: 'PENDING',
        provider: 'mock',
        expires_at: reg.hold_expires_at,
      })
      .select('id')
      .single();

    const { getProvider } = await import('@/modules/payments/providers');
    const { env } = await import('@/lib/env');
    const provider = getProvider('mock');
    const created = await provider.create({
      paymentId: payment!.id,
      amount: Number(reg.amount),
      orderCode: reg.code,
      returnUrl: `${env.APP_URL}/payment/result?paymentId=${payment!.id}`,
    });

    return NextResponse.json(
      { registrationId: reg.registration_id, code: reg.code, paymentId: payment!.id, redirectUrl: created.redirectUrl },
      { status: 201 },
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
