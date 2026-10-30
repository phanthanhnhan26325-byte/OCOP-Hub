import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().optional(),
});

async function audit(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  after: object,
) {
  await supabase.from('audit_logs').insert({
    actor_id: actorId,
    actor_role: 'ADMIN',
    action,
    entity_type: entityType,
    entity_id: entityId,
    after,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = reviewSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();

    const { data: product } = await supabase.from('products').select('id, status').eq('id', id).single();
    if (!product || product.status !== 'PENDING') {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Sản phẩm không ở trạng thái chờ duyệt' } }, { status: 409 });
    }

    const { error } = await supabase
      .from('products')
      .update({
        status: body.data.decision,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: body.data.decision === 'REJECTED' ? body.data.reason ?? '' : null,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);
    await audit(supabase, admin.id, 'PRODUCT_REVIEW', 'product', id, body.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
