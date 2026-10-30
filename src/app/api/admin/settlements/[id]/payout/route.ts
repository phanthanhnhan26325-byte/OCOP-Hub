import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

/** Admin ghi nhận payout đã chuyển cho Partner. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireRole('ADMIN');
    const { id } = await params;
    const body = z
      .object({ amount: z.number().positive(), refNo: z.string().min(3), method: z.string().default('BANK_TRANSFER') })
      .safeParse(await req.json());
    if (!body.success) return NextResponse.json({ error: { code: 'VALIDATION' } }, { status: 400 });
    const supabase = await supabaseServer();

    const { data: statement } = await supabase.from('settlement_statements').select('*').eq('id', id).single();
    if (!statement) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    if (Number(body.data.amount) > Number(statement.net_payable)) {
      return NextResponse.json({ error: { code: 'AMOUNT_EXCEEDS' } }, { status: 400 });
    }

    const { error } = await supabase.from('payouts').insert({
      statement_id: id,
      partner_id: statement.partner_id,
      amount: body.data.amount,
      method: body.data.method,
      ref_no: body.data.refNo,
      transferred_at: new Date().toISOString(),
      recorded_by: admin.id,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
