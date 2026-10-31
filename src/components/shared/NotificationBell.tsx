'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

function notificationHref(item: NotificationItem, roles: string[]) {
  if (item.type === 'product_review_request') return '/admin/products';
  if (item.type === 'workshop_review_request') return '/admin/workshops';
  if (item.type === 'order_placed' && roles.includes('ADMIN')) return '/admin/orders';
  if (item.ref_type === 'partner_order') return '/partner/orders';
  if (item.ref_type === 'order') return '/orders';
  if (item.ref_type === 'product') return roles.includes('ADMIN') ? '/admin/products' : '/partner/products';
  if (item.ref_type === 'workshop') return roles.includes('ADMIN') ? '/admin/workshops' : '/partner/workshops';
  return '/';
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function NotificationBell({
  initialNotifications,
  roles,
}: {
  initialNotifications: NotificationItem[];
  roles: string[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const refresh = useCallback(async () => {
    const response = await fetch('/api/notifications', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? 'Không thể tải thông báo');
    setNotifications(data.notifications);
    setError(null);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      refresh().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Không thể tải thông báo');
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function markAsRead(item: NotificationItem) {
    if (item.read_at) return;
    const response = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? 'Không thể cập nhật thông báo');
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === item.id ? { ...notification, read_at: new Date().toISOString() } : notification,
      ),
    );
  }

  async function openNotification(item: NotificationItem) {
    try {
      await markAsRead(item);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật thông báo');
    }
    setOpen(false);
    router.push(notificationHref(item, roles));
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#d7d0b8] bg-white/60 text-[#1d4d38] transition hover:bg-white"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-14 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold">Thông báo</h2>
            <button type="button" onClick={() => refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không thể tải thông báo'))} className="text-xs text-emerald-700 hover:underline">
              Làm mới
            </button>
          </div>
          {error && <p role="alert" className="px-4 pt-2 text-xs text-red-600">{error}</p>}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Chưa có thông báo.</p>
            ) : notifications.map((item) => (
              <Link
                key={item.id}
                href={notificationHref(item, roles)}
                onClick={(event) => {
                  event.preventDefault();
                  void openNotification(item);
                }}
                className={`block border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 ${item.read_at ? '' : 'bg-emerald-50/60'}`}
              >
                <span className="flex items-start gap-2">
                  {!item.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{item.title}</span>
                    {item.body && <span className="mt-1 block text-xs text-slate-600">{item.body}</span>}
                    <span className="mt-1 block text-[11px] text-slate-400">{formatTime(item.created_at)}</span>
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
