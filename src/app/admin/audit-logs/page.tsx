import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('id, actor_id, actor_role, action, entity_type, entity_id, before, after, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  return (
    <div>
      <h1 className="text-2xl font-bold">Nhật ký hoạt động</h1>
      <p className="mt-1 text-sm text-slate-500">200 sự kiện mới nhất; chi tiết thay đổi được lưu dưới dạng JSON.</p>
      <div className="mt-5 space-y-3">
        {logs.map((log) => (
          <article key={log.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-semibold">{log.action} · {log.entity_type}{log.entity_id ? ` / ${log.entity_id}` : ''}</h2>
              <time className="text-xs text-slate-500">{formatDate(log.created_at)}</time>
            </div>
            <p className="mt-1 text-xs text-slate-500">{log.actor_role || 'SYSTEM'} · {log.actor_id || 'Không có tài khoản tác nhân'}</p>
            {(log.before || log.after) && (
              <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
              </pre>
            )}
          </article>
        ))}
        {logs.length === 0 && <p className="text-sm text-slate-500">Chưa có nhật ký.</p>}
      </div>
    </div>
  );
}
