import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Proxy (thay middleware.ts trong Next 16) — chặn theo đường dẫn + session cookie.
 * Quyền chi tiết được kiểm lại ở service layer (requireRole) — proxy chỉ là lớp đầu tiên.
 */
export async function proxy(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* no-op trong proxy */
        },
      },
    },
  );
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  const path = request.nextUrl.pathname;

  const needAuth =
    path.startsWith('/profile') ||
    path.startsWith('/account') ||
    path.startsWith('/cart') ||
    path.startsWith('/checkout') ||
    path.startsWith('/orders') ||
    path.startsWith('/partner') ||
    path.startsWith('/admin');

  if (needAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Admin chỉ vào /admin; Customer/Partner không được vào /admin
  if (path.startsWith('/admin') && user) {
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === 'ADMIN');
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.searchParams.delete('next');
      return NextResponse.redirect(url);
    }
  }

  // Đã đăng nhập mà vào /login → về trang chủ
  if (path === '/login' && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/profile/:path*', '/account/:path*', '/cart/:path*', '/checkout/:path*', '/orders/:path*', '/partner/:path*', '/admin/:path*', '/login'],
};
