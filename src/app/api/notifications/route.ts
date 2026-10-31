import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const updateSchema = z.object({
  id: z.string().uuid(),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, ref_type, ref_id, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return NextResponse.json({ notifications: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = updateSchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Thông báo không hợp lệ' } }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', body.data.id)
      .eq('user_id', user.id)
      .is('read_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      const { data: existing, error: existingError } = await supabase
        .from('notifications')
        .select('id')
        .eq('id', body.data.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (!existing) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy thông báo' } }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
