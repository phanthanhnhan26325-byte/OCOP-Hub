import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const expenseSchema = z.object({
  expenseType: z.enum(['SHIPPING', 'OPERATING']),
  description: z.string().trim().min(3).max(500),
  amount: z.number().int().positive(),
  incurredAt: z.string().datetime(),
  referenceCode: z.string().trim().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const parsed = expenseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Thông tin chi phí không hợp lệ' } },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin().rpc('admin_record_financial_expense', {
      p_admin: admin.id,
      p_expense_type: parsed.data.expenseType,
      p_description: parsed.data.description,
      p_amount: parsed.data.amount,
      p_incurred_at: parsed.data.incurredAt,
      p_reference_code: parsed.data.referenceCode ?? null,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
