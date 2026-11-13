import { redirect } from 'next/navigation';
import { ProfileWorkspace, type ProfileOrder, type ProfileRegistration } from '@/components/customer/ProfileWorkspace';
import { getSessionUser } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { withSignedOrderEvidence } from '@/modules/orders/order-service-requests';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hồ sơ của tôi — OCOP Hub' };

type ProfileRow = {
  full_name: string | null;
  phone: string | null;
  address?: string | null;
  avatar_url: string | null;
  created_at: string;
};

function isMissingAddressColumn(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (message.includes('address') && (message.includes('does not exist') || message.includes('schema cache')))
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/profile');

  const supabase = await supabaseServer();
  const readProfile = async () => {
    let result = await supabase
      .from('users')
      .select('full_name, phone, address, avatar_url, created_at')
      .eq('id', user.id)
      .maybeSingle();
    let addressUnavailable = false;
    if (result.error && isMissingAddressColumn(result.error)) {
      result = await supabase
        .from('users')
        .select('full_name, phone, avatar_url, created_at')
        .eq('id', user.id)
        .maybeSingle();
      addressUnavailable = !result.error;
    }
    return { ...result, addressUnavailable };
  };

  const [profileResult, { data: orderData }, { data: registrationData }] = await Promise.all([
    readProfile(),
    supabase
      .from('orders')
      .select('id, code, status, total, placed_at, shipping_address, orders_child:orders!parent_order_id(id, code, status, total, partner_id, partner_profiles(business_name), order_items(id, product_id, product_name, product_image, qty, unit_price, line_total, products(slug)), order_status_history(to_status, created_at, reason), order_service_requests(id, order_id, request_type, status, reason, evidence_path, contact_phone, partner_response, refund_amount, refund_status, created_at))')
      .eq('customer_id', user.id)
      .eq('order_level', 'PARENT')
      .order('placed_at', { ascending: false }),
    supabase
      .from('workshop_registrations')
      .select('id, code, status, amount, created_at, workshop_sessions(starts_at, ends_at, location, workshops(title, slug, cover_image, partner_profiles(business_name)))')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (profileResult.error) console.error('[profile:read]', profileResult.error.message);

  const customerOrders = await Promise.all((orderData ?? []).map(async (order) => ({
    ...order,
    orders_child: await Promise.all((order.orders_child ?? []).map(async (child) => ({
      ...child,
      order_service_requests: await withSignedOrderEvidence(child.order_service_requests ?? []),
    }))),
  })));
  const profile = profileResult.data as ProfileRow | null;
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
      addressUnavailable={profileResult.addressUnavailable}
      roles={user.roles}
      initialOrderId={orderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId) ? orderId : null}
      orders={customerOrders as unknown as ProfileOrder[]}
      registrations={(registrationData ?? []) as unknown as ProfileRegistration[]}
    />
  );
}