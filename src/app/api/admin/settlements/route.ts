import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Admin tạo settlement cho Partner theo kỳ. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const body = z
      .object({ partnerId: z.string().uuid(), periodStart: z.string(), periodEnd: z.string() })
      .safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const { data, error } = await supabaseAdmin().rpc('generate_settlement', {
      p_partner: body.data.partnerId,
      p_start: body.data.periodStart,
      p_end: body.data.periodEnd,
    });
    if (error) throw new Error(error.message);
    const { error: auditError } = await supabaseAdmin().from('audit_logs').insert({
      actor_id: admin.id,
      actor_role: 'ADMIN',
      action: 'SETTLEMENT_GENERATED',
      entity_type: 'settlement',
      entity_id: (data as { statement_id: string }).statement_id,
      after: data,
    });
    if (auditError) throw new Error(auditError.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    await requireRole('ADMIN');
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from('settlement_statements')
      .select('*, partner_profiles(business_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    return NextResponse.json({ statements: data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}
