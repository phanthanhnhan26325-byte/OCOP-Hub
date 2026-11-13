import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['APPROVE', 'REJECT', 'RECEIVE_RETURN']),
  reason: z.string().trim().max(1000).optional(),
}).superRefine((body, ctx) => {
  if (body.action === 'REJECT' && (body.reason?.length ?? 0) < 3) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Vui lòng nhập lý do từ chối ít nhất 3 ký tự.' });
  }
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApprovedPartner();
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Mã đơn hàng không hợp lệ.' } }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: parsed.error.issues.map(issue => issue.message).join('; ') } }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().rpc('partner_update_order_return', {
      p_partner: user.id,
      p_order: id,
      p_request: parsed.data.requestId,
      p_action: parsed.data.action,
      p_reason: parsed.data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
