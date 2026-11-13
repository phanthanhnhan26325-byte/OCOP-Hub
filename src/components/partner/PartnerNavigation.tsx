'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PartnerIcon, type PartnerIconName } from './PartnerIcon';

interface SidebarLink {
  href: string;
  label: string;
  icon: PartnerIconName;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: PartnerIconName;
  links: SidebarLink[];
}

const groups: SidebarGroup[] = [
  {
    id: 'overview',
    label: 'TỔNG QUAN',
    icon: 'overview',
    links: [{ href: '/partner', label: 'Dashboard', icon: 'overview' }],
  },
  {
    id: 'sales',
    label: 'QUẢN LÝ BÁN HÀNG',
    icon: 'box',
    links: [
      { href: '/partner/orders', label: 'Đơn hàng', icon: 'bag' },
      { href: '/partner/products', label: 'Sản phẩm', icon: 'box' },
      { href: '/partner/workshops', label: 'Workshop', icon: 'calendar' },
    ],
  },
  {
    id: 'finance',
    label: 'QUẢN LÝ TÀI CHÍNH',
    icon: 'wallet',
    links: [{ href: '/partner/settlements', label: 'Đối soát & thanh toán', icon: 'wallet' }],
  },
];

function isActive(href: string, pathname: string) {
  return href === '/partner' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function PartnerNavigation() {
  const pathname = usePathname();
  const activeGroup = groups.find((group) => group.links.some((item) => isActive(item.href, pathname)))?.id;
  const [openGroupState, setOpenGroupState] = useState<{ routeKey: string; ids: string[] }>({
    routeKey: pathname,
    ids: activeGroup ? [activeGroup] : [],
  });
  const openGroups = openGroupState.routeKey === pathname
    ? openGroupState.ids
    : activeGroup ? [activeGroup] : [];

  return (
    <aside className="w-full shrink-0 md:w-64">
      <nav
        aria-label="Điều hướng doanh nghiệp"
        className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:sticky md:top-24 md:max-h-[calc(100vh-7rem)]"
      >
        <div className="space-y-2">
          {groups.map((group) => {
            const isOpen = openGroups.includes(group.id);
            const groupHasActiveLink = group.links.some((item) => isActive(item.href, pathname));
            const panelId = `partner-nav-${group.id}`;

            return (
              <section key={group.id} className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => {
                    setOpenGroupState((currentState) => {
                      const current = currentState.routeKey === pathname
                        ? currentState.ids
                        : activeGroup ? [activeGroup] : [];

                      return {
                        routeKey: pathname,
                        ids: current.includes(group.id)
                          ? current.filter((id) => id !== group.id)
                          : [...current, group.id],
                      };
                    });
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold tracking-wide transition-colors ${
                    groupHasActiveLink ? 'text-emerald-800' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <PartnerIcon name={group.icon} className="h-[17px]! w-[17px]!" />
                  <span className="min-w-0 flex-1">{group.label}</span>
                  <svg
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {isOpen && (
                  <div id={panelId} className="ml-3 space-y-0.5 border-l border-slate-200 pl-2">
                    {group.links.map((item) => {
                      const active = isActive(item.href, pathname);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                            active
                              ? 'bg-emerald-50 font-medium text-emerald-800'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-emerald-800'
                          }`}
                        >
                          <PartnerIcon name={item.icon} className="h-4! w-4!" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
