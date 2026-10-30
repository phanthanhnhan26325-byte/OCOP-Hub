import crypto from 'node:crypto';
import { env } from '@/lib/env';

export interface PaymentProviderCreateInput {
  paymentId: string;
  amount: number;
  orderCode: string;
  returnUrl: string;
}

export interface PaymentProviderCreateResult {
  redirectUrl: string;
  providerTxnId: string;
  raw?: unknown;
}

export interface WebhookVerifyResult {
  valid: boolean;
  paymentId: string;
  providerTxnId: string;
  amount: number;
  eventId: string;
  status: 'SUCCESS' | 'FAILED';
}

export interface PaymentProvider {
  name: string;
  create(input: PaymentProviderCreateInput): Promise<PaymentProviderCreateResult>;
  verifyWebhook(headers: Headers, body: string): Promise<WebhookVerifyResult>;
  refund(input: { paymentId: string; providerTxnId: string; amount: number; reason: string }): Promise<{ providerRefundId: string }>;
}

/** HMAC helper — các gateway thật sẽ thay bằng cơ chế ký riêng (RSA/HMAC). */
export function sign(payload: string): string {
  return crypto.createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(payload).digest('hex');
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Mock provider — mô phỏng cổng thanh toán cho môi trường dev/sandbox.
 * Redirect tới trang /pay/mock/[id] để "giả lập" thành công/thất bại,
 * trang đó gọi webhook có chữ ký HMAC — đúng flow thật (không tin frontend).
 */
export class MockProvider implements PaymentProvider {
  name = 'mock';

  async create(input: PaymentProviderCreateInput): Promise<PaymentProviderCreateResult> {
    const providerTxnId = `MOCK-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const redirectUrl = `${env.APP_URL}/pay/mock/${input.paymentId}?txn=${encodeURIComponent(providerTxnId)}`;
    return { redirectUrl, providerTxnId };
  }

  async verifyWebhook(_headers: Headers, body: string): Promise<WebhookVerifyResult> {
    const payload = JSON.parse(body) as {
      eventId: string;
      paymentId: string;
      providerTxnId: string;
      amount: number;
      status: 'SUCCESS' | 'FAILED';
      signature: string;
    };
    const expected = sign(
      `${payload.eventId}:${payload.paymentId}:${payload.providerTxnId}:${payload.amount}:${payload.status}`,
    );
    return {
      valid: timingSafeEqualHex(expected, payload.signature ?? ''),
      paymentId: payload.paymentId,
      providerTxnId: payload.providerTxnId,
      amount: payload.amount,
      eventId: payload.eventId,
      status: payload.status,
    };
  }

  async refund(input: { paymentId: string; providerTxnId: string; amount: number; reason: string }): Promise<{ providerRefundId: string }> {
    void input;
    return { providerRefundId: `MOCK-RF-${Date.now()}-${crypto.randomBytes(3).toString('hex')}` };
  }
}

const providers: Record<string, PaymentProvider> = {
  mock: new MockProvider(),
};

export function getProvider(name: string): PaymentProvider {
  const p = providers[name];
  if (!p) throw new Error(`Unknown payment provider: ${name}`);
  return p;
}
