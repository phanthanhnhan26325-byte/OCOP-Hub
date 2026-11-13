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
  // Lỗi Postgres phổ biến → trả thông báo rõ ràng thay vì "Lỗi máy chủ"
  const uniqueViolation = /duplicate key value violates unique constraint "([^"]+)"/.exec(message);
  if (uniqueViolation) {
    const constraint = uniqueViolation[1];
    if (constraint === 'products_slug_key') {
      return NextResponse.json(
        { error: { code: 'SLUG_TAKEN', message: 'Slug sản phẩm đã tồn tại. Nếu sản phẩm này đã có trong danh sách, hãy bấm “Sửa” để gửi duyệt lại; nếu không, hãy đổi tên hoặc slug.' } },
        { status: 409 },
      );
    }
    if (constraint === 'uq_product_variants_label') {
      return NextResponse.json(
        { error: { code: 'DUPLICATE_VARIANT', message: 'Khối lượng của các biến thể không được trùng nhau.' } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: 'Dữ liệu đã tồn tại. Vui lòng kiểm tra lại thông tin.' } },
      { status: 409 },
    );
  }
  if (/row-level security policy/i.test(message)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này hoặc phiên đăng nhập đã hết hạn.' } },
      { status: 403 },
    );
  }
  // RPC errors từ Postgres (checkout, register...)
  const codeMatch = /^(INSUFFICIENT_SUPPLY|INSUFFICIENT_CENTRAL_STOCK|INVENTORY_RESERVATION_INVALID|ALREADY_REGISTERED|NO_SEATS|SESSION_NOT_OPEN|SESSION_STARTED|INVALID_ADDRESS|PRODUCT_NOT_AVAILABLE|PRODUCT_VARIANT_REQUIRED|ORDER_STATE_INVALID|ORDER_NOT_FOUND|RETURN_REQUEST_INVALID|RETURN_REQUEST_NOT_FOUND|REGISTRATION_STATE_INVALID|REGISTRATION_NOT_CANCELLABLE|PAYMENT_ALREADY_COMPLETED|AMOUNT_MISMATCH|INVALID_PAYMENT_STATE|PAYMENT_NOT_FOUND|AMOUNT_EXCEEDS|INVALID_REASON|PAYOUT_ACCOUNT_REQUIRED|NO_SETTLEMENT_AMOUNT|SETTLEMENT_ALREADY_PAID|SETTLEMENT_REQUEST_ALREADY_EXISTS|SETTLEMENT_REQUEST_REQUIRED|VALIDATION|NOT_FOUND|FORBIDDEN|INVALID_STATE):?(.*)$/.exec(message);
  if (codeMatch) {
    const status =
      codeMatch[1] === 'FORBIDDEN' ? 403 :
      codeMatch[1] === 'NOT_FOUND' || codeMatch[1] === 'ORDER_NOT_FOUND' ? 404 :
      codeMatch[1] === 'RETURN_REQUEST_NOT_FOUND' ? 404 :
      codeMatch[1].includes('ALREADY') || codeMatch[1].includes('INSUFFICIENT') || codeMatch[1].includes('NO_SEATS') || codeMatch[1].includes('NOT_CANCELLABLE') || codeMatch[1] === 'ORDER_STATE_INVALID' || codeMatch[1].includes('REQUEST_INVALID') || codeMatch[1].includes('SETTLEMENT') || codeMatch[1] === 'NO_SETTLEMENT_AMOUNT' || codeMatch[1] === 'INVALID_STATE' || codeMatch[1] === 'AMOUNT_MISMATCH' || codeMatch[1] === 'AMOUNT_EXCEEDS' ? 409 : 400;
    return NextResponse.json(
      { error: { code: codeMatch[1], message: codeMatch[2] ? `${codeMatch[1]}: ${codeMatch[2]}` : message } },
      { status },
    );
  }
  console.error('[api:error]', err);
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL',
        message: process.env.NODE_ENV === 'production' ? 'Lỗi máy chủ' : `Lỗi máy chủ: ${message}`,
      },
    },
    { status: 500 },
  );
}

export function zodIssues(err: { issues: { path: (string | number)[]; message: string }[] }) {
  return err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
