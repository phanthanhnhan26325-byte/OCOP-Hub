import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE') }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(3).max(500) }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Mã yêu cầu không hợp lệ.' } }, { status: 400 });
    }
    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: parsed.error.issues.map((issue) => issue.message).join('; ') } }, { status: 400 });
    }

    const { error } = await supabaseAdmin().rpc('admin_review_settlement_request', {
      p_admin: admin.id,
      p_request: id,
      p_decision: parsed.data.decision,
      p_reason: parsed.data.decision === 'REJECT' ? parsed.data.reason : null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
