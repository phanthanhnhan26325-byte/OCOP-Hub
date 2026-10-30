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

    const { data: app } = await supabase
      .from('partner_applications')
      .select('id, partner_id, status')
      .eq('id', id)
      .single();
    if (!app || app.status !== 'PENDING') {
      return NextResponse.json({ error: { code: 'INVALID_STATE' } }, { status: 409 });
    }

    await supabase
      .from('partner_applications')
      .update({
        status: body.data.decision,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: body.data.decision === 'REJECTED' ? body.data.reason ?? '' : null,
      })
      .eq('id', id);

    const sellingStatus = body.data.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    await supabase
      .from('partner_profiles')
      .update({
        selling_status: sellingStatus,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: body.data.decision === 'REJECTED' ? body.data.reason ?? '' : null,
      })
      .eq('user_id', app.partner_id);

    await supabase.from('audit_logs').insert({
      actor_id: admin.id,
      actor_role: 'ADMIN',
      action: 'PARTNER_APPLICATION_REVIEW',
      entity_type: 'partner_application',
      entity_id: id,
      after: body.data,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
