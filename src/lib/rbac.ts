import { NextResponse } from 'next/server';
import { AppError } from '@/lib/errors';
import { supabaseServer } from '@/lib/supabase/server';

export type Role = 'CUSTOMER' | 'PARTNER' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  roles: Role[];
}

/** Lấy session user + roles từ Supabase Auth (server-side). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id);
  return {
    id: data.user.id,
    email: data.user.email ?? '',
    roles: (roles ?? []).map((r) => r.role as Role),
  };
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError('UNAUTHORIZED', 'Vui lòng đăng nhập', 401);
  return user;
}

export async function requireRole(role: Role): Promise<SessionUser & { role: Role }> {
  const user = await requireAuth();
  if (!user.roles.includes(role)) {
    throw new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này', 403);
  }
  return { ...user, role };
}

export async function requireApprovedPartner() {
  const user = await requireRole('PARTNER');
  const supabase = await supabaseServer();
  const { data: profile } = await supabase
    .from('partner_profiles')
    .select('user_id, selling_status, business_name')
    .eq('user_id', user.id)
    .single();
  if (!profile || profile.selling_status !== 'APPROVED') {
    throw new AppError(
      'PARTNER_NOT_APPROVED',
      'Tài khoản doanh nghiệp chưa được phê duyệt bán hàng',
      403,
    );
  }
  return { ...user, profile };
}

/** Wrap handler: bắt AppError và lỗi Supabase → JSON chuẩn hóa. */
export function handleApiError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : 'Lỗi máy chủ';
  // RPC errors từ Postgres (checkout, register...)
  const codeMatch = /^(INSUFFICIENT_SUPPLY|INSUFFICIENT_CENTRAL_STOCK|INVENTORY_RESERVATION_INVALID|ALREADY_REGISTERED|NO_SEATS|SESSION_NOT_OPEN|SESSION_STARTED|INVALID_ADDRESS|PRODUCT_NOT_AVAILABLE|PRODUCT_VARIANT_REQUIRED|ORDER_STATE_INVALID|ORDER_NOT_FOUND|REGISTRATION_STATE_INVALID|REGISTRATION_NOT_CANCELLABLE|PAYMENT_ALREADY_COMPLETED|AMOUNT_MISMATCH|INVALID_PAYMENT_STATE|PAYMENT_NOT_FOUND|AMOUNT_EXCEEDS|INVALID_REASON|VALIDATION|NOT_FOUND|FORBIDDEN|INVALID_STATE):?(.*)$/.exec(message);
  if (codeMatch) {
    const status =
      codeMatch[1] === 'FORBIDDEN' ? 403 :
      codeMatch[1] === 'NOT_FOUND' || codeMatch[1] === 'ORDER_NOT_FOUND' ? 404 :
      codeMatch[1].includes('ALREADY') || codeMatch[1].includes('INSUFFICIENT') || codeMatch[1].includes('NO_SEATS') || codeMatch[1].includes('NOT_CANCELLABLE') || codeMatch[1] === 'INVALID_STATE' || codeMatch[1] === 'AMOUNT_MISMATCH' ? 409 : 400;
    return NextResponse.json(
      { error: { code: codeMatch[1], message: codeMatch[2] ? `${codeMatch[1]}: ${codeMatch[2]}` : message } },
      { status },
    );
  }
  console.error('[api:error]', err);
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Lỗi máy chủ' } }, { status: 500 });
}

export function zodIssues(err: { issues: { path: (string | number)[]; message: string }[] }) {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
