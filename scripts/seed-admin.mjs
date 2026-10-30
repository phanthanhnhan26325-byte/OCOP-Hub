import { createClient } from '@supabase/supabase-js';

/**
 * Script seed tài khoản Admin (chạy server-side, không qua UI).
 * Usage: node --experimental-strip-types scripts/seed-admin.mjs
 * Hoặc import từ route dev-only.
 *
 * Admin KHÔNG ĐƯỢC đăng ký công khai — tài khoản chỉ sinh ra từ đây.
 */
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing env');
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const email = process.env.ADMIN_EMAIL ?? 'admin@ocop.hub';
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe@123456';

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'System Administrator', role: 'ADMIN_META_IGNORED' },
  });
  if (error && !error.message.includes('already')) {
    throw error;
  }
  const userId = created?.user?.id;
  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users.find((u) => u.email === email);
    if (!found) throw new Error('Cannot find/create admin user');
    await admin.from('user_roles').upsert({ user_id: found.id, role: 'ADMIN' }, { onConflict: 'user_id,role' });
    console.log('Admin already exists, role ensured:', found.id);
    return;
  }
  // Trigger đã tạo CUSTOMER role mặc định → thêm ADMIN
  const { error: roleErr } = await admin
    .from('user_roles')
    .upsert({ user_id: userId, role: 'ADMIN' }, { onConflict: 'user_id,role' });
  if (roleErr) throw roleErr;
  console.log('Admin seeded:', userId, email);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
