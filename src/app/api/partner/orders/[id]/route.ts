import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const allowed: Record<string, string[]> = {
  PENDING_ACCEPTANCE: ['ACCEPTED', 'REJECTED_BY_PARTNER'],
  ACCEPTED: ['PROCESSING'],
  PROCESSING: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['COMPLETED'],
};

const bodySchema = z.object({
  toStatus: z.enum(['ACCEPTED', 'REJECTED_BY_PARTNER', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED']),
  reason: z.string().optional(),
});

/** Partner cập nhật sub-order của mình (chỉ sub-order thuộc partner). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();

    const { data: order } = await supabase
      .from('orders')
      .select('id, partner_id, status, order_level, parent_order_id')
      .eq('id', id)
      .single();
    if (!order || order.order_level !== 'CHILD') {
      return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
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

    const { error } = await supabase.from('orders').update({ status: body.data.toStatus, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    await supabase.from('order_status_history').insert({
      order_id: id,
      from_status: order.status,
      to_status: body.data.toStatus,
      actor_id: user.id,
      actor_role: 'PARTNER',
      reason: body.data.reason ?? '',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
