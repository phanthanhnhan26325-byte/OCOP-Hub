import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
  receivedVia: z.string().trim().max(100).optional(),
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
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Thông tin trả hàng/hoàn tiền không hợp lệ' } }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().rpc('admin_record_order_return_refund', {
      p_admin: admin.id,
      p_order: id,
      p_amount: body.data.amount,
      p_reason: body.data.reason,
      p_received_via: body.data.receivedVia ?? null,
      p_transfer_reference: body.data.transferReference,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
