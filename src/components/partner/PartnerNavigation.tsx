'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PartnerIcon, type PartnerIconName } from './PartnerIcon';

const items: { href: string; label: string; icon: PartnerIconName }[] = [
  { href: '/partner', label: 'Tổng quan', icon: 'overview' },
  { href: '/partner/orders', label: 'Đơn hàng', icon: 'bag' },
  { href: '/partner/products', label: 'Sản phẩm', icon: 'box' },
  { href: '/partner/workshops', label: 'Workshop', icon: 'calendar' },
  { href: '/partner/settlements', label: 'Đối soát & thanh toán', icon: 'wallet' },
];

export function PartnerNavigation() {
  const pathname = usePathname();
  return <div className="overflow-x-auto bg-[#195c46] text-white">
    <nav aria-label="Điều hướng doanh nghiệp" className="mx-auto flex w-max items-center gap-2 px-4 py-3 sm:px-6">
      {items.map(({ href, label, icon }) => {
        const active = href === '/partner' ? pathname === href : pathname.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition ${active ? 'border-[#ebc86c] bg-white/10 text-[#ffe3a0]' : 'border-transparent text-white/85 hover:bg-white/10 hover:text-white'}`}><PartnerIcon name={icon} />{label}</Link>;
      })}
    </nav>
  </div>;
}
