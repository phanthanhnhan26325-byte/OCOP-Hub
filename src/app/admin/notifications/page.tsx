import { requireRole } from '@/lib/rbac';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatDate } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  await requireRole('ADMIN');
  const { data: notifications, error } = await supabaseAdmin()
    .from('notifications')
    .select('id, user_id, type, title, body, ref_type, ref_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const userIds = [...new Set((notifications ?? []).map((item) => item.user_id))];
  const { data: users, error: usersError } = userIds.length
    ? await supabaseAdmin().from('users').select('id, full_name, email').in('id', userIds)
    : { data: [], error: null };
  if (usersError) throw new Error(usersError.message);
  const userById = new Map((users ?? []).map((user) => [user.id, user]));

  return (
    <div>
      <h1 className="text-2xl font-bold">Thông báo hệ thống</h1>
      <p className="mt-1 text-sm text-slate-500">200 thông báo gần nhất, gồm trạng thái đọc và đối tượng liên quan.</p>
      <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {(notifications ?? []).map((notification) => {
          const user = userById.get(notification.user_id);
          return (
            <article key={notification.id} className="p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-medium">{notification.title}</h2>
                <span className="text-xs text-slate-500">{notification.read_at ? 'Đã đọc' : 'Chưa đọc'} · {formatDate(notification.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{notification.body || 'Không có nội dung.'}</p>
              <p className="mt-2 text-xs text-slate-400">{user?.full_name || user?.email || notification.user_id} · {notification.type}{notification.ref_type ? ` · ${notification.ref_type}` : ''}{notification.ref_id ? `:${notification.ref_id}` : ''}</p>
            </article>
          );
        })}
        {(!notifications || notifications.length === 0) && <p className="p-5 text-sm text-slate-500">Chưa có thông báo.</p>}
      </div>
    </div>
  );
}
