import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Admin ghi nhận payout đã chuyển cho Partner. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = z
      .object({ amount: z.number().int().positive(), refNo: z.string().trim().min(3).max(200), method: z.string().default('BANK_TRANSFER') })
      .safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const { error } = await supabaseAdmin().rpc('admin_record_payout', {
      p_admin: admin.id,
      p_statement: id,
      p_amount: body.data.amount,
      p_ref_no: body.data.refNo,
      p_method: body.data.method,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
