'use client';

import { useState } from 'react';

export type ProfileTabId = 'overview' | 'personal' | 'orders' | 'workshops';

type IconName = 'dashboard' | 'user' | 'bag' | 'calendar' | 'activity';

interface SidebarLink {
  id: ProfileTabId;
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
    links: [{ id: 'overview', label: 'Tổng quan', icon: 'dashboard' }],
  },
  {
    id: 'account',
    label: 'TÀI KHOẢN',
    icon: 'user',
    links: [{ id: 'personal', label: 'Thông tin cá nhân', icon: 'user' }],
  },
  {
    id: 'activity',
    label: 'HOẠT ĐỘNG',
    icon: 'activity',
    links: [
      { id: 'orders', label: 'Lịch sử mua hàng', icon: 'bag' },
      { id: 'workshops', label: 'Lịch sử Workshop', icon: 'calendar' },
    ],
  },
];

const iconPaths: Record<IconName, string> = {
  dashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
};

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
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

export function ProfileSidebar({ activeTab, onTabChange }: { activeTab: ProfileTabId; onTabChange: (tab: ProfileTabId) => void }) {
  const activeGroup = groups.find((group) => group.links.some((item) => item.id === activeTab))?.id;
  const [openGroupState, setOpenGroupState] = useState<{ activeTab: ProfileTabId; ids: string[] }>({
    activeTab,
    ids: activeGroup ? [activeGroup] : [],
  });
  const openGroups = openGroupState.activeTab === activeTab
    ? openGroupState.ids
    : activeGroup ? [activeGroup] : [];

  return (
    <aside className="w-full shrink-0 md:w-64">
      <nav
        aria-label="Điều hướng hồ sơ"
        className="max-h-[55vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:sticky md:top-24 md:max-h-[calc(100vh-7rem)]"
      >
        <div className="space-y-2">
          {groups.map((group) => {
            const isOpen = openGroups.includes(group.id);
            const groupHasActiveLink = group.links.some((item) => item.id === activeTab);
            const panelId = `profile-nav-${group.id}`;

            return (
              <section key={group.id} className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => {
                    setOpenGroupState((currentState) => {
                      const current = currentState.activeTab === activeTab
                        ? currentState.ids
                        : activeGroup ? [activeGroup] : [];

                      return {
                        activeTab,
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
                  <Icon name={group.icon} className="h-[17px] w-[17px] shrink-0" />
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
                      const active = item.id === activeTab;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onTabChange(item.id)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                            active
                              ? 'bg-emerald-50 font-medium text-emerald-800'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-emerald-800'
                          }`}
                        >
                          <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </button>
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
