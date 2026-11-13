import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireApprovedPartner } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const accountSchema = z.object({
  bankName: z.string().trim().min(2).max(100),
  accountHolder: z.string().trim().min(2).max(120),
  accountNumber: z.string().trim().min(5).max(34).regex(/^[A-Za-z0-9 -]+$/),
});

export async function PATCH(request: NextRequest) {
  try {
    const partner = await requireApprovedPartner();
    const parsed = accountSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: parsed.error.issues.map((issue) => issue.message).join('; ') } }, { status: 400 });
    }

    const { error } = await supabaseAdmin()
      .from('partner_payout_accounts')
      .upsert({
        partner_id: partner.id,
        bank_name: parsed.data.bankName,
        account_holder: parsed.data.accountHolder,
        account_number: parsed.data.accountNumber.replace(/\s+/g, ''),
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
