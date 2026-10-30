import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sign } from '@/modules/payments/providers';
import { supabaseServer } from '@/lib/supabase/server';
import { handleApiError, requireAuth } from '@/lib/rbac';

const bodySchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().positive(),
  txn: z.string().min(3),
  status: z.enum(['SUCCESS', 'FAILED']),
});

/**
 * Endpoint mô phỏng gateway gửi webhook — ký HMAC phía server rồi gọi thẳng
 * logic webhook thật (/api/payments/webhook/mock). KHÔNG bypass xác thực.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });

    const { paymentId, amount, txn, status } = body.data;
    const eventId = `EVT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const signature = sign(`${eventId}:${paymentId}:${txn}:${amount}:${status}`);

    const supabase = await supabaseServer();
    const { data: payment } = await supabase.from('payments').select('id').eq('id', paymentId).single();
    if (!payment) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });

    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/payments/webhook/mock`;
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId, paymentId, providerTxnId: txn, amount, status, signature }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
