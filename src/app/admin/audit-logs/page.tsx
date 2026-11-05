import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

interface UserSummary {
  id: string;
  full_name: string | null;
  email: string;
}

const entityLabels: Record<string, string> = {
  fee_config: 'Cơ cấu chi phí',
  order: 'Đơn hàng',
  payment: 'Thanh toán',
  partner_application: 'Hồ sơ đăng ký bán hàng',
  product: 'Sản phẩm',
  product_category: 'Danh mục sản phẩm',
  settlement: 'Đối soát',
  workshop: 'Workshop',
  workshop_session: 'Buổi workshop',
};

const actionLabels: Record<string, string> = {
  FEE_CONFIG_UPDATED: 'Cập nhật cơ cấu chi phí',
  INVENTORY_MOVEMENT: 'Cập nhật số lượng sản phẩm',
  MANUAL_REFUND_RECORDED: 'Ghi nhận hoàn tiền',
  PARTNER_APPLICATION_REVIEW: 'Xét duyệt hồ sơ đăng ký bán hàng',
  PAYOUT_RECORDED: 'Ghi nhận chi trả đối tác',
  PAYMENT_BUSINESS_SYNC_RETRY_FAILED: 'Đồng bộ thanh toán thất bại',
  PRODUCT_CATEGORY_DELETED: 'Xóa danh mục sản phẩm',
  PRODUCT_CATEGORY_SAVED: 'Thêm hoặc cập nhật danh mục sản phẩm',
  PRODUCT_REVIEW: 'Xét duyệt sản phẩm',
  ORDER_BANK_PAYMENT_CONFIRMED: 'Xác nhận thanh toán đơn hàng',
  ORDER_CANCELLATION_PROCESSED: 'Xử lý hủy đơn hàng',
  ORDER_RETURN_REFUNDED: 'Xử lý trả hàng và hoàn tiền',
  ORDER_SHIPMENT_UPDATED: 'Cập nhật vận chuyển đơn hàng',
  SETTLEMENT_CONFIRMED: 'Xác nhận đối soát',
  SETTLEMENT_GENERATED: 'Tạo kỳ đối soát',
  WORKSHOP_REVIEW: 'Xét duyệt workshop',
  WORKSHOP_SESSION_STATUS_CHANGED: 'Cập nhật trạng thái buổi workshop',
};

const decisionLabels: Record<string, string> = {
  APPROVE: 'đã duyệt',
  APPROVED: 'đã duyệt',
  REJECT: 'đã từ chối',
  REJECTED: 'đã từ chối',
};

function getActivityDescription(log: ActivityLog) {
  const description =
    actionLabels[log.action] ??
    log.action
      .toLocaleLowerCase('vi-VN')
      .replaceAll('_', ' ')
      .replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase('vi-VN'));

  const decision =
    typeof log.after?.decision === 'string'
      ? decisionLabels[log.after.decision]
      : undefined;

  return decision ? `${description} — ${decision}` : description;
}

function getRoleLabel(role: string | null) {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'PARTNER') return 'Partner';
  if (role === 'SYSTEM' || !role) return 'Hệ thống';
  return role;
}

export default async function AdminAuditLogsPage() {
  await requireRole('ADMIN');
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_id, actor_role, action, entity_type, entity_id, after, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const logs = (data ?? []) as ActivityLog[];
  const actorIds = [...new Set(
    logs
      .map((log) => log.actor_id)
      .filter((id): id is string => Boolean(id)),
  )];

  let usersById = new Map<string, UserSummary>();
  if (actorIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', actorIds);

    if (usersError) throw new Error(usersError.message);
    usersById = new Map(
      ((users ?? []) as UserSummary[]).map((user) => [user.id, user]),
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Nhật ký hoạt động</h1>
      <p className="mt-1 text-sm text-slate-500">
        Lịch sử 200 thao tác gần nhất được ghi nhận trên hệ thống.
      </p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Thời gian</th>
              <th scope="col" className="px-4 py-3">Người thực hiện</th>
              <th scope="col" className="px-4 py-3">Vai trò</th>
              <th scope="col" className="px-4 py-3">Hoạt động</th>
              <th scope="col" className="px-4 py-3">Đối tượng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => {
              const actor = log.actor_id ? usersById.get(log.actor_id) : null;
              const entity = entityLabels[log.entity_type] ?? log.entity_type;

              return (
                <tr key={log.id} className="align-top hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    <time dateTime={log.created_at}>{formatDate(log.created_at)}</time>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {actor?.full_name || actor?.email || (log.actor_id ? 'Tài khoản không còn tồn tại' : 'Tự động')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {getRoleLabel(log.actor_role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{getActivityDescription(log)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {entity}
                    {log.entity_id && (
                      <span className="mt-1 block max-w-56 truncate font-mono text-xs text-slate-400" title={log.entity_id}>
                        {log.entity_id}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Chưa có hoạt động được ghi nhận.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
