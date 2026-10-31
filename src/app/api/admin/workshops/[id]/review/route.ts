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

    const { data: ws, error: workshopError } = await supabase
      .from('workshops')
      .select('id, partner_id, title, status')
      .eq('id', id)
      .maybeSingle();
    if (workshopError) throw new Error(workshopError.message);
    if (!ws || ws.status !== 'PENDING') {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Workshop không ở trạng thái chờ duyệt' } }, { status: 409 });
    }

    const { data: updated, error } = await supabase
      .from('workshops')
      .update({
        status: body.data.decision,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: body.data.decision === 'REJECTED' ? body.data.reason ?? '' : null,
      })
      .eq('id', id)
      .eq('status', 'PENDING')
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Workshop đã được xử lý bởi quản trị viên khác' } }, { status: 409 });
    }

    // Khi APPROVED → mở các buổi có tương lai
    if (body.data.decision === 'APPROVED') {
      const { error: sessionError } = await supabase
        .from('workshop_sessions')
        .update({ status: 'OPEN' })
        .eq('workshop_id', id)
        .eq('status', 'SCHEDULED')
        .gt('starts_at', new Date().toISOString());
      if (sessionError) throw new Error(sessionError.message);
    }

    const { error: auditError } = await supabase.from('audit_logs').insert({
      actor_id: admin.id,
      actor_role: 'ADMIN',
      action: 'WORKSHOP_REVIEW',
      entity_type: 'workshop',
      entity_id: id,
      after: body.data,
    });
    if (auditError) throw new Error(auditError.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
