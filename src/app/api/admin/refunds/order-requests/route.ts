import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  requestId: z.string().uuid(),
  transferReference: z.string().trim().min(3).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Thông tin hoàn tiền không hợp lệ.' } }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().rpc('mark_order_service_refund_complete', {
      p_admin: admin.id,
      p_request: parsed.data.requestId,
      p_transfer_reference: parsed.data.transferReference,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
