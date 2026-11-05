'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { NotificationBell } from '@/components/shared/NotificationBell';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ref_type: string | null;
  ref_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function SiteHeaderNav({
  user,
  notifications,
  cartQuantity,
}: {
  user: { email: string; roles: string[] } | null;
  notifications: NotificationItem[];
  cartQuantity: number;
}) {
  const pathname = usePathname();
  const avatarText = user?.roles.includes('ADMIN') ? 'A' : user?.roles.includes('PARTNER') ? 'P' : 'U';
  const avatarTone = user?.roles.includes('ADMIN')
    ? 'from-[#1d4d38] to-[#0e3034]'
    : user?.roles.includes('PARTNER')
      ? 'from-[#2a7a4e] to-[#1d4d38]'
      : 'from-[#7da066] to-[#3d6f46]';

  const navItems = [
    { href: '/', label: 'Trang chủ' },
    { href: '/products', label: 'Sản phẩm' },
    { href: '/workshops', label: 'Workshop' },
    ...(user?.roles.includes('PARTNER') ? [{ href: '/partner', label: 'Khu vực DN' }] : []),
    ...(user?.roles.includes('ADMIN') ? [{ href: '/admin', label: 'Quản trị' }] : []),
  ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#d9d1b7] bg-[#f7f4ec]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-3 text-xl font-bold text-[#1d4d38]">
            <img src="/Logo.png" alt="COP Hub logo" className="h-12 w-auto object-contain" />
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-6 text-[15px] font-medium text-slate-700 md:flex">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    'group relative pb-2 transition-all duration-300 hover:scale-[1.08]',
                    active ? 'text-[#1d4d38]' : 'text-slate-700 hover:text-[#1d4d38]',
                  ].join(' ')}
                >
                  <span className="relative z-10">{item.label}</span>
                  {active && (
                    <span className="absolute inset-x-0 -bottom-1 h-[3px] rounded-full bg-[#f4c95b] transition-all duration-300" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-sm">
          {user ? (
            <>
              <NotificationBell initialNotifications={notifications} roles={user.roles} />
              <Link href="/cart" aria-label={`Giỏ hàng, ${cartQuantity} sản phẩm`} title={`Giỏ hàng: ${cartQuantity} sản phẩm`} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#d7d0b8] bg-white/60 text-[#1d4d38] transition hover:bg-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <circle cx="9" cy="19" r="1.5" />
                  <circle cx="17" cy="19" r="1.5" />
                  <path d="M3 4h2l2.4 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L19 7H7" />
                </svg>
                <span aria-live="polite" aria-atomic="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1d4d38] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#f7f4ec]">
                  <span aria-hidden="true">{cartQuantity > 99 ? '99+' : cartQuantity}</span>
                  <span className="sr-only">{cartQuantity} sản phẩm trong giỏ hàng</span>
                </span>
              </Link>

              <Link href="/profile" aria-label="Hồ sơ người dùng" title="Hồ sơ của tôi" className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[#d7d0b8] bg-gradient-to-br text-xs font-bold text-white shadow-sm shadow-[#1d4d38]/10 transition hover:opacity-95">
                <span className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${avatarTone}`}>{avatarText}</span>
              </Link>

              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-full border border-[#d7d0b8] bg-white/60 px-3 py-2 font-medium text-[#1d4d38] transition hover:bg-white">
                Đăng nhập
              </Link>
              <Link href="/register" className="rounded-full bg-[#1d4d38] px-4 py-2 font-semibold text-white shadow-md shadow-[#1d4d38]/20 transition hover:bg-[#173b2e]">
                Đăng ký
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
