import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

/** Partner gửi workshop lên duyệt (DRAFT/REJECTED → PENDING). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const supabase = await supabaseServer();
    const { data: ws, error: workshopError } = await supabase
      .from('workshops')
      .select('id, partner_id, status')
      .eq('id', id)
      .maybeSingle();
    if (workshopError) throw new Error(workshopError.message);
    if (!ws || ws.partner_id !== user.id) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Workshop không thuộc doanh nghiệp của bạn' } }, { status: 403 });
    }
    if (ws.status === 'REJECTED') {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Vui lòng chọn “Sửa và gửi lại” để bổ sung thông tin workshop.' } }, { status: 400 });
    }
    if (ws.status !== 'DRAFT') {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Workshop không ở trạng thái có thể gửi duyệt' } }, { status: 409 });
    }
    const { data: updated, error } = await supabase
      .from('workshops')
      .update({ status: 'PENDING', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', ws.status)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json({ error: { code: 'INVALID_STATE', message: 'Workshop đã được gửi hoặc cập nhật bởi người khác' } }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
