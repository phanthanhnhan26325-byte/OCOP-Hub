'use server';

import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

const registerSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  fullName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự'),
  role: z.enum(['CUSTOMER', 'PARTNER']),
});

export type RegisterResult = { ok: true } | { ok: false; message: string };

/**
 * Đăng ký Customer hoặc Partner.
 * KHÔNG BAO GIỜ cho phép role=ADMIN qua luồng này (trigger DB cũng chỉ set CUSTOMER/PARTNER).
 */
export async function registerAction(input: z.infer<typeof registerSchema>): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((i) => i.message).join('; ') };
  }
  const { email, password, fullName, role } = parsed.data;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, role } },
  });
  if (error) {
    return { ok: false, message: error.message.includes('already registered') ? 'Email đã được sử dụng' : error.message };
  }
  return { ok: true };
}

export async function loginAction(input: { email: string; password: string }): Promise<{ ok: true } | { ok: false; message: string }> {
  const email = input.email.trim().toLowerCase();
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });

  if (error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('email not confirmed') || msg.includes('confirm your email') || msg.includes('confirm your email address')) {
      return { ok: false, message: 'Tài khoản chưa xác nhận email. Vui lòng mở email và xác nhận trước khi đăng nhập.' };
    }

    if (msg.includes('invalid login credentials') || msg.includes('wrong password')) {
      return { ok: false, message: 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.' };
    }

    console.error('Login failed:', error);
    return { ok: false, message: `Đăng nhập thất bại: ${error.message}` };
  }

  return { ok: true };
}

export async function logoutAction() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
}

/** Admin khởi tạo tài khoản Partner/Agent bằng service role — chỉ gọi từ script server. */
export async function assertCannotRegisterAdmin() {
  throw new AppError('FORBIDDEN', 'Không thể đăng ký tài khoản Admin', 403);
}
