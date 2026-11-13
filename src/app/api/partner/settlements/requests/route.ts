import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

const requestSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-01$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: NextRequest) {
  try {
    const partner = await requireApprovedPartner();
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Chọn một tháng đối soát hợp lệ.' } }, { status: 400 });
    }

    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc('partner_request_settlement', {
      p_partner: partner.id,
      p_start: parsed.data.periodStart,
      p_end: parsed.data.periodEnd,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
