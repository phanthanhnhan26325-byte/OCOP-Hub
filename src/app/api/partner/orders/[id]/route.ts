import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

const allowed: Record<string, string[]> = {
  PENDING_ACCEPTANCE: ['ACCEPTED', 'REJECTED_BY_PARTNER'],
  ACCEPTED: ['PROCESSING'],
  PROCESSING: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
};

const bodySchema = z.object({
  toStatus: z.enum(['ACCEPTED', 'REJECTED_BY_PARTNER', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED']),
  reason: z.string().trim().max(2000).optional(),
}).superRefine((body, ctx) => {
  if (body.toStatus === 'REJECTED_BY_PARTNER' && (body.reason?.length ?? 0) < 3) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Vui lòng nhập lý do từ chối ít nhất 3 ký tự.' });
  }
});

/** Partner cập nhật sub-order của mình (chỉ sub-order thuộc partner). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Mã đơn hàng không hợp lệ.' } }, { status: 400 });
    }
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION', message: body.error.issues.map(issue => issue.message).join('; ') } }, { status: 400 });
    const supabase = await supabaseServer();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, partner_id, status, order_level, parent_order_id')
      .eq('id', id)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order || order.order_level !== 'CHILD') {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy đơn hàng thuộc doanh nghiệp.' } }, { status: 404 });
    }
    if (order.partner_id !== user.id) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Đơn hàng không thuộc doanh nghiệp của bạn' } }, { status: 403 });
    }
    const nextAllowed = allowed[order.status] ?? [];
    if (!nextAllowed.includes(body.data.toStatus)) {
      return NextResponse.json(
        { error: { code: 'INVALID_TRANSITION', message: `Không thể chuyển từ ${order.status} sang ${body.data.toStatus}` } },
        { status: 409 },
      );
    }

    // RLS only grants partners SELECT on orders. Authorize above with the
    // session client, then keep ownership and prior-state checks on the write.
    const admin = supabaseAdmin();
    const { data: updated, error } = await admin.from('orders')
      .update({ status: body.data.toStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('partner_id', user.id)
      .eq('order_level', 'CHILD')
      .eq('status', order.status)
      .select('id, status')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json({ error: { code: 'INVALID_TRANSITION', message: 'Đơn hàng vừa được cập nhật. Vui lòng tải lại trang để xem trạng thái mới.' } }, { status: 409 });
    }
    const { error: historyError } = await admin.from('order_status_history').insert({
      order_id: id,
      from_status: order.status,
      to_status: body.data.toStatus,
      actor_id: user.id,
      actor_role: 'PARTNER',
      reason: body.data.reason ?? '',
    });
    // The status is already saved: report that accurately even if audit logging fails.
    if (historyError) console.error('Saving partner order status history failed:', { orderId: id, error: historyError });
    return NextResponse.json({
      ok: true,
      status: updated.status,
      ...(historyError ? { warning: 'Trạng thái đơn đã được lưu, nhưng chưa ghi được lịch sử thay đổi. Vui lòng báo quản trị viên.' } : {}),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
