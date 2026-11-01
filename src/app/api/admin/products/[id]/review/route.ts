import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.decision === 'REJECTED' && (data.reason?.length ?? 0) < 3) {
    ctx.addIssue({
      code: 'custom',
      path: ['reason'],
      message: 'Lý do từ chối phải có ít nhất 3 ký tự',
    });
  }
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = reviewSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const { error } = await supabaseAdmin().rpc('admin_review_product', {
      p_admin: admin.id,
      p_product: id,
      p_decision: body.data.decision,
      p_reason: body.data.reason ?? '',
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
