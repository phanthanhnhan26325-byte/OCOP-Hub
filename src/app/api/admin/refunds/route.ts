import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { z } from 'zod';

/** Ghi nhận khoản hoàn đã chuyển thủ công, kèm mã đối chiếu ngân hàng. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const body = z
      .object({
        paymentId: z.string().uuid(),
        amount: z.number().int().positive(),
        reason: z.string().trim().min(3).max(500),
        transferReference: z.string().trim().min(3).max(200),
      })
      .safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const { data, error } = await supabaseAdmin().rpc('admin_record_manual_refund', {
      p_admin: admin.id,
      p_payment: body.data.paymentId,
      p_amount: body.data.amount,
      p_reason: body.data.reason,
      p_transfer_reference: body.data.transferReference,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Admin xem danh sách refunds. */
export async function GET() {
  try {
    await requireRole('ADMIN');
    const supabase = await supabaseServer();
    const { data, error } = await supabase.from('refunds').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return NextResponse.json({ refunds: data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}
