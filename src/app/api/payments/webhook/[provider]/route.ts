import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/modules/payments/providers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { handleApiError } from '@/lib/rbac';

/**
 * Webhook nhận kết quả thanh toán từ cổng.
 * KHÔNG tin frontend redirect — chỉ xác thực tại đây (ký + amount).
 * Idempotent: payment_events.event_id unique + apply_payment_success CAS.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  try {
    const { provider: providerName } = await params;
    const rawBody = await req.text();
    const provider = getProvider(providerName);
    const verified = await provider.verifyWebhook(req.headers, rawBody);

    // Ghi nhận event kể cả khi signature sai (để audit), nhưng không apply
    const supabase = supabaseAdmin();
    if (!verified.valid) {
      await supabase.from('payment_events').upsert(
        {
          event_id: `INVALID-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          payment_id: verified.paymentId || null,
          signature_valid: false,
          raw: JSON.parse(rawBody) as object,
          processed: false,
        },
        { onConflict: 'event_id' },
      );
      return NextResponse.json({ error: { code: 'INVALID_SIGNATURE' } }, { status: 401 });
    }

    if (verified.status === 'FAILED') {
      await supabase
        .from('payments')
        .update({ status: 'FAILED', updated_at: new Date().toISOString() })
        .eq('id', verified.paymentId)
        .in('status', ['CREATED', 'PENDING']);
      return NextResponse.json({ ok: true, result: 'MARKED_FAILED' });
    }

    const { data, error } = await supabase.rpc('apply_payment_success', {
      p_payment_id: verified.paymentId,
      p_provider: providerName,
      p_provider_txn_id: verified.providerTxnId,
      p_event_id: verified.eventId,
      p_amount: verified.amount,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    return handleApiError(err);
  }
}
