import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';

const feeSchema = z.object({
  scope: z.enum(['GLOBAL', 'PARTNER']),
  partnerId: z.string().uuid().optional(),
  type: z.enum(['PLATFORM_RATE', 'SHIPPING']),
  value: z.number().finite().min(0),
}).superRefine((value, context) => {
  if ((value.scope === 'PARTNER') !== Boolean(value.partnerId)) {
    context.addIssue({ code: 'custom', message: 'Chọn đúng phạm vi doanh nghiệp cho cấu hình phí' });
  }
  if (value.type === 'PLATFORM_RATE' && value.value > 1) {
    context.addIssue({ code: 'custom', message: 'Tỷ lệ phí nền tảng phải nằm trong khoảng 0 đến 1' });
  }
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireRole('ADMIN');
    const parsed = feeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: parsed.error.issues.map((issue) => issue.message).join('; ') } },
        { status: 400 },
      );
    }

    const fee = parsed.data;
    const { data, error } = await supabaseAdmin().rpc('admin_upsert_fee_config', {
      p_admin: admin.id,
      p_scope: fee.scope,
      p_partner: fee.partnerId ?? null,
      p_type: fee.type,
      p_rules: fee.type === 'PLATFORM_RATE' ? { rate: fee.value } : { flat: fee.value },
    });
    if (error) throw new Error(error.message);
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
