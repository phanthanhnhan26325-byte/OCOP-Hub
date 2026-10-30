import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const supabase = await supabaseServer();
    const { data: ws } = await supabase.from('workshops').select('id, partner_id').eq('id', id).single();
    if (!ws || ws.partner_id !== user.id) {
      return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
    }
    // Không cho xóa nếu có đăng ký CONFIRMED
    const { data: hasRegs } = await supabase
      .from('workshop_registrations')
      .select('id')
      .in('session_id', (await supabase.from('workshop_sessions').select('id').eq('workshop_id', id)).data?.map((s) => s.id) ?? [])
      .eq('status', 'CONFIRMED')
      .limit(1);
    if (hasRegs && hasRegs.length > 0) {
      return NextResponse.json({ error: { code: 'HAS_REGISTRATIONS', message: 'Đã có đăng ký xác nhận — không thể xóa' } }, { status: 409 });
    }
    await supabase.from('workshops').delete().eq('id', id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
