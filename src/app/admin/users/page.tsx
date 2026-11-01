
import Link from 'next/link';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate } from '@/lib/money';

export const dynamic = 'force-dynamic';

interface UserRoleRow {
  role: string;
}

interface PartnerProfileRow {
  business_name: string;
  selling_status: string;
}

type UserRole = 'CUSTOMER' | 'PARTNER';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[] }>;
}) {
  await requireRole('ADMIN');

  const params = await searchParams;
  const roleFilter =
    params.role === 'CUSTOMER' || params.role === 'PARTNER'
      ? params.role as UserRole
      : null;
  const supabase = await supabaseServer();

  let adminIds: string[] = [];
  if (roleFilter === 'CUSTOMER') {
    const { data: admins, error: adminsError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'ADMIN');

    if (adminsError) {
      console.error('Admin users role exclusion query error:', adminsError);
      throw new Error(adminsError.message);
    }

    adminIds = (admins ?? []).map((admin) => admin.user_id);
  }

  let usersQuery = supabase
    .from('users')
    .select(`
      id,
      email,
      full_name,
      phone,
      status,
      created_at,
      user_roles${roleFilter ? '!inner' : ''}(role),
      partner_profiles!partner_profiles_user_id_fkey(
        business_name,
        selling_status
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (roleFilter) {
    usersQuery = usersQuery.eq('user_roles.role', roleFilter);
  }

  if (roleFilter === 'CUSTOMER' && adminIds.length > 0) {
    usersQuery = usersQuery.not('id', 'in', `(${adminIds.join(',')})`);
  }

  const { data: users, error } = await usersQuery;

  if (error) {
    console.error('Admin users query error:', error);
    throw new Error(error.message);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">
        Tài khoản người dùng
      </h1>

      <p className="mt-1 text-sm text-slate-500">
        Danh sách tối đa 200 tài khoản mới nhất;
        vai trò quản trị không thể thay đổi từ màn hình này.
      </p>

      <nav aria-label="Lọc tài khoản theo vai trò" className="mt-5 flex flex-wrap gap-2">
        {([
          { label: 'Tất cả', role: null },
          { label: 'Khách hàng', role: 'CUSTOMER' },
          { label: 'Đối tác', role: 'PARTNER' },
        ] as const).map(({ label, role }) => {
          const active = roleFilter === role;
          const href = role ? `/admin/users?role=${role}` : '/admin/users';

          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                active
                  ? 'border-emerald-700 bg-emerald-700 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-800'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3">Người dùng</th>
              <th className="px-4 py-3">Liên hệ</th>
              <th className="px-4 py-3">Vai trò</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Tham gia</th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => {
              const roles =
                user.user_roles as unknown as UserRoleRow[];

              const partners =
                user.partner_profiles as unknown as PartnerProfileRow[];

              return (
                <tr
                  key={user.id}
                  className="border-b border-slate-50 align-top hover:bg-slate-50/70"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="font-medium text-emerald-800 hover:underline"
                    >
                      {user.full_name || 'Chưa cập nhật tên'}
                    </Link>

                    <p className="font-mono text-xs text-slate-400">
                      {user.id}
                    </p>

                    {partners?.[0] && (
                      <p className="mt-1 text-xs text-emerald-700">
                        {partners[0].business_name}
                        {' · '}
                        {partners[0].selling_status}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {user.email}

                    <p className="text-xs text-slate-500">
                      {user.phone || 'Chưa có số điện thoại'}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    {roles?.map((row) => row.role).join(', ') || '—'}
                  </td>

                  <td className="px-4 py-3">
                    {user.status}
                  </td>

                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(user.created_at)}
                  </td>
                </tr>
              );
            })}

            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-5 text-center text-slate-500"
                >
                  {roleFilter === 'CUSTOMER'
                    ? 'Chưa có tài khoản khách hàng.'
                    : roleFilter === 'PARTNER'
                      ? 'Chưa có tài khoản đối tác.'
                      : 'Chưa có tài khoản.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
