import { NextResponse } from 'next/server';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const { error } = await supabaseAdmin().rpc('admin_confirm_settlement', {
      p_admin: admin.id,
      p_statement: id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
