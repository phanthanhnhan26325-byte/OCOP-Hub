'use client';

import { useState, type ReactNode } from 'react';

export function CollapsibleSidebar({ id, children }: { id: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`w-full shrink-0 md:transition-[width] md:duration-200 ${collapsed ? 'md:w-10' : 'md:w-64'}`}>
      <button
        type="button"
        aria-label={collapsed ? 'Hiện thanh điều hướng' : 'Ẩn thanh điều hướng'}
        aria-controls={id}
        aria-expanded={!collapsed}
        title={collapsed ? 'Hiện thanh điều hướng' : 'Ẩn thanh điều hướng'}
        onClick={() => setCollapsed((value) => !value)}
        className={`mb-2 flex h-10 items-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-300 hover:text-emerald-800 ${
          collapsed ? 'w-10 justify-center' : 'w-full justify-between px-3'
        }`}
      >
        {!collapsed && <span>Ẩn thanh điều hướng</span>}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-4 w-4"
        >
          <path
            d={collapsed ? 'm8 4 6 6-6 6' : 'm12 4-6 6 6 6'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div id={id} hidden={collapsed}>
        {children}
      </div>
    </aside>
  );
}
