import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  receivedVia: z.string().trim().max(100).optional(),
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
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Cần nhập lý do hủy đơn hợp lệ' } }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin().rpc('admin_cancel_unpaid_order', {
      p_admin: admin.id,
      p_order: id,
      p_reason: body.data.reason,
      p_received_via: body.data.receivedVia ?? null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
