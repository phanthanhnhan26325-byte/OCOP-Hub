import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { z } from 'zod';

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên cần có ít nhất 2 ký tự').max(100, 'Họ tên quá dài'),
  email: z.string().trim().email('Email không hợp lệ').max(254),
  phone: z.string().trim().max(30, 'Số điện thoại quá dài').regex(/^[0-9+().\s-]*$/, 'Số điện thoại không hợp lệ'),
  address: z.string().trim().max(300, 'Địa chỉ quá dài'),
});

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join('. ') },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();
    const emailChanged = parsed.data.email.toLowerCase() !== user.email.toLowerCase();
    if (emailChanged) {
      const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
      if (error) {
        return NextResponse.json({ error: 'Không thể cập nhật email. Vui lòng kiểm tra email mới.' }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from('users')
      .update({
        full_name: parsed.data.fullName,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, emailConfirmationRequired: emailChanged });
  } catch (error) {
    return handleApiError(error);
  }
}