import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.number().int().positive(),
  transferReference: z.string().trim().min(3).max(200),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = bodySchema.safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Thông tin xác nhận thanh toán không hợp lệ' } }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().rpc('admin_confirm_bank_order_payment', {
      p_admin: admin.id,
      p_order: id,
      p_payment: body.data.paymentId,
      p_amount: body.data.amount,
      p_transfer_reference: body.data.transferReference,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
