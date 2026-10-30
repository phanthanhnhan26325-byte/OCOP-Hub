import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const reviewSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().optional() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = reviewSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();

    const { data: ws } = await supabase.from('workshops').select('id, status').eq('id', id).single();
    if (!ws || ws.status !== 'PENDING') {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Workshop không ở trạng thái chờ duyệt' } }, { status: 409 });
    }

    await supabase
      .from('workshops')
      .update({
        status: body.data.decision,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: body.data.decision === 'REJECTED' ? body.data.reason ?? '' : null,
      })
      .eq('id', id);

    // Khi APPROVED → mở các buổi có tương lai
    if (body.data.decision === 'APPROVED') {
      await supabase
        .from('workshop_sessions')
        .update({ status: 'OPEN' })
        .eq('workshop_id', id)
        .eq('status', 'SCHEDULED')
        .gt('starts_at', new Date().toISOString());
    }

    await supabase.from('audit_logs').insert({
      actor_id: admin.id,
      actor_role: 'ADMIN',
      action: 'WORKSHOP_REVIEW',
      entity_type: 'workshop',
      entity_id: id,
      after: body.data,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
