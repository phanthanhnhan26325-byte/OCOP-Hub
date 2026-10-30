import { redirect } from 'next/navigation';
import { ProfileWorkspace, type ProfileOrder, type ProfileRegistration } from '@/components/customer/ProfileWorkspace';
import { getSessionUser } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hồ sơ của tôi — OCOP Hub' };

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  created_at: string;
};

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/profile');

  const supabase = await supabaseServer();
  const [{ data: profileData, error: profileError }, { data: orderData }, { data: registrationData }] = await Promise.all([
    supabase
      .from('users')
      .select('full_name, phone, address, avatar_url, created_at')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id, code, status, total, placed_at, shipping_address, orders_child:orders!parent_order_id(id, code, status, total, partner_id, partner_profiles(business_name), order_items(id, product_name, product_image, qty, unit_price, line_total), order_status_history(to_status, created_at, reason))')
      .eq('customer_id', user.id)
      .eq('order_level', 'PARENT')
      .order('placed_at', { ascending: false }),
    supabase
      .from('workshop_registrations')
      .select('id, code, status, amount, created_at, workshop_sessions(starts_at, ends_at, location, workshops(title, cover_image, partner_profiles(business_name)))')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (profileError) console.error('[profile:read]', profileError.message);

  const profile = profileData as ProfileRow | null;
  return (
    <ProfileWorkspace
      profile={{
        fullName: profile?.full_name ?? '',
        email: user.email,
        phone: profile?.phone ?? '',
        address: profile?.address ?? '',
        avatarUrl: profile?.avatar_url ?? '',
        createdAt: profile?.created_at ?? '',
      }}
      roles={user.roles}
      orders={(orderData ?? []) as unknown as ProfileOrder[]}
      registrations={(registrationData ?? []) as unknown as ProfileRegistration[]}
    />
  );
}