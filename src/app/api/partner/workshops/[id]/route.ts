import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

const editSchema = z.object({
  title: z.string().trim().min(5),
  description: z.string(),
  experienceContent: z.string().optional(),
  coverImage: z.string().url().nullable().optional(),
  action: z.literal('submit'),
  sessions: z.array(z.object({
    id: z.string().uuid().optional(),
    startsAt: z.string().datetime(), endsAt: z.string().datetime(),
    location: z.string().trim().min(3), fee: z.number().nonnegative(), capacity: z.number().int().positive(),
  }).refine(s => new Date(s.endsAt) > new Date(s.startsAt), 'Thời gian kết thúc phải sau thời gian bắt đầu')).min(1),
}).refine(d => {
  const ids = d.sessions.flatMap(s => s.id ? [s.id] : []);
  return new Set(ids).size === ids.length;
}, 'Buổi tổ chức không được trùng nhau');

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const body = editSchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION', message: body.error.issues.map(i => i.message).join('; ') } }, { status: 400 });
    const { error } = await supabaseAdmin().rpc('partner_resubmit_workshop', { p_workshop: id, p_partner: user.id, p_data: body.data });
    if (error?.code === '23503') return NextResponse.json({ error: { code: 'HAS_REGISTRATIONS', message: 'Không thể xóa buổi đã có khách hàng đăng ký tham gia. Vui lòng tải lại trang để cập nhật danh sách.' } }, { status: 409 });
    if (error?.code === 'PGRST202') return NextResponse.json({ error: { code: 'RESUBMISSION_NOT_CONFIGURED', message: 'Chức năng gửi duyệt lại workshop chưa được cập nhật trên cơ sở dữ liệu. Vui lòng liên hệ quản trị viên.' } }, { status: 503 });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id });
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const supabase = await supabaseServer();
    const { data: ws, error: lookupError } = await supabase.from('workshops').select('id, partner_id').eq('id', id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!ws || ws.partner_id !== user.id) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Bạn chỉ có thể xóa workshop của doanh nghiệp mình.' } }, { status: 403 });
    }
    const { data: sessions, error: sessionsError } = await supabase
      .from('workshop_sessions').select('id').eq('workshop_id', id);
    if (sessionsError) throw sessionsError;
    // Khóa ngoại giữ lại lịch sử đăng ký ở mọi trạng thái.
    if (sessions.length > 0) {
      const { data: hasRegs, error: registrationsError } = await supabase
      .from('workshop_registrations')
      .select('id')
      .in('session_id', sessions.map((s) => s.id))
      .limit(1);
      if (registrationsError) throw registrationsError;
      if (hasRegs && hasRegs.length > 0) {
        return NextResponse.json({ error: { code: 'HAS_REGISTRATIONS', message: 'Workshop đã có lịch sử đăng ký nên không thể xóa.' } }, { status: 409 });
      }
    }
    const { data: deleted, error: deleteError } = await supabase.from('workshops').delete().eq('id', id).eq('partner_id', user.id).select('id');
    if (deleteError?.code === '23503') {
      return NextResponse.json({ error: { code: 'HAS_REGISTRATIONS', message: 'Workshop đang có dữ liệu liên quan nên không thể xóa.' } }, { status: 409 });
    }
    if (deleteError) throw deleteError;
    if (!deleted?.length) {
      return NextResponse.json({ error: { code: 'DELETE_NOT_ALLOWED', message: 'Workshop không còn tồn tại hoặc tài khoản chưa được cấp quyền xóa.' } }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
