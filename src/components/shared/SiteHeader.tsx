export async function SiteHeader() {
  const { getSessionUser } = await import('@/lib/rbac');
  const { SiteHeaderNav } = await import('@/components/shared/SiteHeaderNav');
  const user = await getSessionUser();
  let cartQuantity = 0;
  let notifications: {
    id: string;
    type: string;
    title: string;
    body: string | null;
    ref_type: string | null;
    ref_id: string | null;
    read_at: string | null;
    created_at: string;
  }[] = [];

  if (user) {
    const { supabaseServer } = await import('@/lib/supabase/server');
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, ref_type, ref_id, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    notifications = data;
    const { data: cart, error: cartError } = await supabase
      .from('carts')
      .select('id, cart_items(product_id)')
      .eq('customer_id', user.id)
      .maybeSingle();
    if (cartError) throw new Error(cartError.message);
    cartQuantity = new Set((cart?.cart_items ?? []).map((item) => item.product_id)).size;
  }

  return <SiteHeaderNav user={user} notifications={notifications} cartQuantity={cartQuantity} />;
}
