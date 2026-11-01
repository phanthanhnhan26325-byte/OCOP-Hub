'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type IconName =
  | 'dashboard'
  | 'accounts'
  | 'approvals'
  | 'operations'
  | 'finance'
  | 'activity'
  | 'customer'
  | 'partner'
  | 'permissions'
  | 'application'
  | 'product'
  | 'workshop'
  | 'category'
  | 'order'
  | 'payment'
  | 'refund'
  | 'settlement'
  | 'fees'
  | 'notification'
  | 'audit';

interface SidebarLink {
  href: string;
  label: string;
  icon: IconName;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: IconName;
  links: SidebarLink[];
}

const groups: SidebarGroup[] = [
  {
    id: 'overview',
    label: 'TỔNG QUAN',
    icon: 'dashboard',
    links: [{ href: '/admin', label: 'Dashboard', icon: 'dashboard' }],
  },
  {
    id: 'accounts',
    label: 'QUẢN LÝ TÀI KHOẢN',
    icon: 'accounts',
    links: [
      { href: '/admin/users?role=CUSTOMER', label: 'Khách hàng', icon: 'customer' },
      { href: '/admin/users?role=PARTNER', label: 'Doanh nghiệp đối tác', icon: 'partner' },
      { href: '/admin/users', label: 'Tài khoản & phân quyền', icon: 'permissions' },
    ],
  },
  {
    id: 'approvals',
    label: 'QUẢN LÝ PHÊ DUYỆT',
    icon: 'approvals',
    links: [
      { href: '/admin/partner-applications', label: 'Phê duyệt bán hàng', icon: 'application' },
      { href: '/admin/products?view=approval', label: 'Phê duyệt sản phẩm', icon: 'product' },
      { href: '/admin/workshops?view=approval', label: 'Phê duyệt workshop', icon: 'workshop' },
    ],
  },
  {
    id: 'operations',
    label: 'QUẢN LÝ VẬN HÀNH',
    icon: 'operations',
    links: [
      { href: '/admin/products', label: 'Sản phẩm', icon: 'product' },
      { href: '/admin/product-categories', label: 'Danh mục sản phẩm', icon: 'category' },
      { href: '/admin/workshops', label: 'Workshop', icon: 'workshop' },
      { href: '/admin/orders', label: 'Đơn hàng', icon: 'order' },
      { href: '/admin/payments', label: 'Thanh toán', icon: 'payment' },
      { href: '/admin/refunds', label: 'Hoàn tiền', icon: 'refund' },
    ],
  },
  {
    id: 'finance',
    label: 'QUẢN LÝ TÀI CHÍNH',
    icon: 'finance',
    links: [
      { href: '/admin/settlements', label: 'Đối soát & chi trả', icon: 'settlement' },
      { href: '/admin/fees', label: 'Cơ cấu chi phí', icon: 'fees' },
    ],
  },
  {
    id: 'activity',
    label: 'QUẢN LÝ HOẠT ĐỘNG',
    icon: 'activity',
    links: [
      { href: '/admin/notifications', label: 'Thông báo', icon: 'notification' },
      { href: '/admin/audit-logs', label: 'Nhật ký hoạt động', icon: 'audit' },
    ],
  },
];

const iconPaths: Record<IconName, string> = {
  dashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  accounts: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M23 11h-6',
  approvals: 'm9 12 2 2 4-4 M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z',
  operations: 'M3 3h18v18H3z M3 9h18 M9 21V9',
  finance: 'M3 3v18h18 M7 14l4-4 4 4 6-7',
  activity: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  customer: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  partner: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9v.01 M9 12v.01 M9 15v.01 M9 18v.01 M15 13v.01 M15 16v.01 M15 19v.01',
  permissions: 'M12 15v2 M7 10V7a5 5 0 0 1 10 0v3 M5 10h14v11H5z',
  application: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8',
  product: 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7 12 12l8.7-5 M12 22V12',
  workshop: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01',
  category: 'M20 10 12 2H4a2 2 0 0 0-2 2v8l8 8 10-10a2 2 0 0 0 0-2z M7 7h.01',
  order: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  payment: 'M2 5h20v14H2z M2 10h20 M6 15h3',
  refund: 'M3 7v6h6 M21 17v-6h-6 M5 17a8 8 0 0 0 13 2l3-2 M19 7A8 8 0 0 0 6 5L3 7',
  settlement: 'M3 3h18v18H3z M7 8h10 M7 12h10 M7 16h6 M16 16l2 2 3-4',
  fees: 'M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  notification: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  audit: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
};

function MenuIcon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function getLinkState(
  href: string,
  pathname: string,
  search: URLSearchParams,
) {
  const [targetPath, targetQuery] = href.split('?');
  const expectedParams = new URLSearchParams(targetQuery ?? '');
  const samePath = pathname === targetPath;
  const nestedPath = pathname.startsWith(`${targetPath}/`);

  if (targetPath === '/admin' && !samePath) {
    return { active: false, expanded: false };
  }

  if (!samePath && !nestedPath) return { active: false, expanded: false };

  if (nestedPath) {
    const hasContext = expectedParams.has('role') || expectedParams.has('view');
    return { active: !hasContext, expanded: true };
  }

  const hasContext = expectedParams.has('role') || expectedParams.has('view');
  if (!hasContext) {
    const active = !search.has('role') && !search.has('view');
    return { active, expanded: true };
  }

  const active = [...expectedParams.entries()].every(
    ([key, value]) => search.get(key) === value,
  );
  return { active, expanded: active };
}

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const search = new URLSearchParams(searchKey);
  const activeGroup = groups.find((group) =>
    group.links.some((item) => getLinkState(item.href, pathname, search).expanded),
  )?.id;
  const routeKey = `${pathname}?${searchKey}`;
  const [openGroupState, setOpenGroupState] = useState<{ routeKey: string; ids: string[] }>({
    routeKey,
    ids: activeGroup ? [activeGroup] : [],
  });
  const openGroups = openGroupState.routeKey === routeKey
    ? openGroupState.ids
    : activeGroup ? [activeGroup] : [];

  return (
    <aside className="w-full shrink-0 md:w-64">
      <nav
        aria-label="Điều hướng quản trị"
        className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:sticky md:top-24 md:max-h-[calc(100vh-7rem)]"
      >
        <div className="space-y-2">
          {groups.map((group) => {
            const isOpen = openGroups.includes(group.id);
            const groupHasActiveLink = group.links.some(
              (item) => getLinkState(item.href, pathname, search).active,
            );
            const panelId = `admin-nav-${group.id}`;

            return (
              <section key={group.id} className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => {
                    setOpenGroupState((currentState) => {
                      const current = currentState.routeKey === routeKey
                        ? currentState.ids
                        : activeGroup ? [activeGroup] : [];

                      return {
                        routeKey,
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
                  <MenuIcon name={group.icon} className="h-[17px] w-[17px] shrink-0" />
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
                      const { active } = getLinkState(item.href, pathname, search);

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
                          <MenuIcon name={item.icon} className="h-4 w-4 shrink-0" />
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
