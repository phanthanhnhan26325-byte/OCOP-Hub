import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuth } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { z } from 'zod';

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: z.string().min(8, 'Mật khẩu mới cần có ít nhất 8 ký tự').max(72),
  confirmPassword: z.string(),
}).refine((value) => value.newPassword === value.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  path: ['newPassword'],
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = passwordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((issue) => issue.message).join('. ') },
        { status: 400 },
      );
    }

    const supabase = await supabaseServer();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.currentPassword,
    });
    if (verifyError) {
      return NextResponse.json({ error: 'Mật khẩu hiện tại không chính xác.' }, { status: 400 });
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
    if (error) {
      return NextResponse.json({ error: 'Không thể đổi mật khẩu. Vui lòng thử lại.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}