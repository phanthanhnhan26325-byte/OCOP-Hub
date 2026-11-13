import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  action: z.enum(['COMPLETE', 'CANCEL', 'RETURN_SENT']),
  reason: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('CUSTOMER');
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Mã đơn hàng không hợp lệ.' } }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: parsed.error.issues.map(issue => issue.message).join('; ') } }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().rpc('customer_update_order', {
      p_customer: user.id,
      p_order: id,
      p_action: parsed.data.action,
      p_reason: parsed.data.reason ?? null,
      p_evidence_path: null,
      p_contact_phone: null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
