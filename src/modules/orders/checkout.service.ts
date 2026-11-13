import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { requireAuth } from '@/lib/rbac';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizeVietnamesePhone } from '@/modules/auth/vietnamese-phone';
import { getVietnameseAddressNames } from './vietnam-address';

export const shippingAddressSchema = z.object({
  receiverName: z.string().trim().min(2).max(100),
  phone: z.string().min(9).max(16),
  address: z.string().trim().min(3).max(300),
  provinceCode: z.string().regex(/^\d{2}$/),
  communeCode: z.string().regex(/^\d{5}$/),
  note: z.string().trim().max(500).optional(),
});

export const checkoutInputSchema = z.object({
  idempotencyKey: z.string().min(8).max(64),
  shippingAddress: shippingAddressSchema,
  selectedCartItemIds: z.array(z.string().uuid()).min(1)
    .refine(ids => new Set(ids).size === ids.length, 'Danh sách sản phẩm được chọn không hợp lệ.'),
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
  const normalizedPhone = normalizeVietnamesePhone(input.shippingAddress.phone);
  if (!normalizedPhone) {
    throw new AppError('INVALID_PHONE', 'Vui lòng nhập số điện thoại di động Việt Nam hợp lệ.', 400);
  }
  const addressNames = getVietnameseAddressNames(
    input.shippingAddress.provinceCode,
    input.shippingAddress.communeCode,
  );
  if (!addressNames) {
    throw new AppError('INVALID_ADDRESS', 'Vui lòng chọn tỉnh/thành phố và xã/phường hợp lệ.', 400);
  }

  const { data: rpc, error } = await supabaseAdmin().rpc('checkout', {
    p_customer: user.id,
    p_idempotency_key: input.idempotencyKey,
    p_shipping_address: {
      receiver_name: input.shippingAddress.receiverName,
      phone: normalizedPhone,
      address: input.shippingAddress.address,
      ward: addressNames.commune,
      commune_code: input.shippingAddress.communeCode,
      city: addressNames.province,
      province_code: input.shippingAddress.provinceCode,
      note: input.shippingAddress.note ?? '',
    },
    p_selected_cart_item_ids: input.selectedCartItemIds,
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
