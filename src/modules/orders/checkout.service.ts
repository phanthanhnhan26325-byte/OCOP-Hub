import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/rbac';
import { env } from '@/lib/env';

export const shippingAddressSchema = z.object({
  receiverName: z.string().min(2),
  phone: z.string().min(8),
  address: z.string().min(5),
  ward: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  note: z.string().optional(),
});

export const checkoutInputSchema = z.object({
  idempotencyKey: z.string().min(8).max(64),
  shippingAddress: shippingAddressSchema,
});

export type CheckoutResult = {
  orderId: string;
  code: string;
  total: string;
  duplicated: boolean;
  paymentId: string;
  redirectUrl: string;
};

/** Tạo hoặc lấy payment cho một reference (order parent hoặc registration). */
export async function ensurePayment(input: {
  purpose: 'ORDER' | 'WORKSHOP_REGISTRATION';
  referenceId: string;
  customerId: string;
  amount: number;
  provider?: string;
}) {
  const supabase = await supabaseServer();
  const { data: existing } = await supabase
    .from('payments')
    .select('id, status, amount, provider')
    .eq('purpose', input.purpose)
    .eq('reference_id', input.referenceId)
    .in('status', ['CREATED', 'PENDING'])
    .maybeSingle();
  if (existing) return existing;

  const expiresAt = new Date(Date.now() + env.PAYMENT_HOLD_TTL_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from('payments')
    .insert({
      purpose: input.purpose,
      reference_id: input.referenceId,
      customer_id: input.customerId,
      amount: input.amount,
      status: 'PENDING',
      provider: input.provider ?? 'mock',
      expires_at: expiresAt,
    })
    .select('id, status, amount, provider')
    .single();
  if (error) throw new AppError('PAYMENT_CREATE_FAILED', error.message, 500);
  return data;
}

/** Checkout giỏ hàng → RPC checkout (atomic) → tạo payment → redirect. */
export async function checkout(input: z.infer<typeof checkoutInputSchema>): Promise<CheckoutResult> {
  const user = await requireAuth();
  const supabase = await supabaseServer();

  const { data: rpc, error } = await supabase.rpc('checkout', {
    p_customer: user.id,
    p_idempotency_key: input.idempotencyKey,
    p_shipping_address: {
      receiver_name: input.shippingAddress.receiverName,
      phone: input.shippingAddress.phone,
      address: input.shippingAddress.address,
      ward: input.shippingAddress.ward ?? '',
      district: input.shippingAddress.district ?? '',
      city: input.shippingAddress.city ?? '',
      note: input.shippingAddress.note ?? '',
    },
  });
  if (error) throw new AppError(error.message.includes('INSUFFICIENT_SUPPLY') ? 'INSUFFICIENT_SUPPLY' : 'CHECKOUT_FAILED', error.message, 400);

  const orderId = (rpc as { order_id: string }).order_id;
  const code = (rpc as { code: string }).code;
  const total = String((rpc as { total: string | number }).total ?? '0');

  // Idempotent: nếu đã có payment cho order này → dùng lại
  const payment = await ensurePayment({
    purpose: 'ORDER',
    referenceId: orderId,
    customerId: user.id,
    amount: Number(total),
  });

  const provider = await (await import('@/modules/payments/providers')).getProvider(payment.provider ?? 'mock');
  const created = await provider.create({
    paymentId: payment.id,
    amount: Number(total),
    orderCode: code,
    returnUrl: `${env.APP_URL}/payment/result?paymentId=${payment.id}`,
  });

  await supabase.from('payment_transactions').insert({
    payment_id: payment.id,
    type: 'PAYMENT',
    provider: provider.name,
    provider_txn_id: created.providerTxnId,
    amount: Number(total),
    status: 'CREATED',
    response: { redirectUrl: created.redirectUrl },
  });

  return {
    orderId,
    code,
    total,
    duplicated: Boolean((rpc as { duplicated?: boolean }).duplicated),
    paymentId: payment.id,
    redirectUrl: created.redirectUrl,
  };
}
