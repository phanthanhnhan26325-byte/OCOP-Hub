import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

/** Partner gửi workshop lên duyệt (DRAFT/REJECTED → PENDING). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const supabase = await supabaseServer();
    const { data: ws } = await supabase.from('workshops').select('id, partner_id, status').eq('id', id).single();
    if (!ws || ws.partner_id !== user.id) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Workshop không thuộc doanh nghiệp của bạn' } }, { status: 403 });
    }
    if (!['DRAFT', 'REJECTED'].includes(ws.status)) {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Workshop không ở trạng thái có thể gửi duyệt' } }, { status: 409 });
    }
    await supabase.from('workshops').update({ status: 'PENDING' }).eq('id', id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
