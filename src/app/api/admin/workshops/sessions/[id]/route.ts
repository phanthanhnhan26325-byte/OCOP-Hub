import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });

    const { data, error } = await supabaseAdmin().rpc('admin_set_workshop_session_status', {
      p_admin: admin.id,
      p_session: id,
      p_status: body.data.status,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
