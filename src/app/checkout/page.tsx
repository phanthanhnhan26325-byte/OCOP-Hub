import { redirect } from 'next/navigation';
import { CheckoutForm, type CheckoutAddressValues } from '@/components/customer/CheckoutForm';
import { getSessionUser } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import {
  findVietnameseCommuneCode,
  findVietnameseProvinceCode,
  getVietnameseAddressNames,
} from '@/modules/orders/vietnam-address';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(record: JsonRecord, key: string) {
  return typeof record[key] === 'string' ? (record[key] as string).trim() : '';
}

function isMissingSavedAddressColumn(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? '';
  return error.code === '42703'
    || error.code === 'PGRST204'
    || (message.includes('default_shipping_address') && (message.includes('does not exist') || message.includes('schema cache')));
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string | string[] }>;
}) {
  const rawItems = (await searchParams).items;
  const itemList = typeof rawItems === 'string' ? rawItems.split(',') : [];
  const selectedCartItemIds = itemList.filter(item => item.length > 0);
  if (
    selectedCartItemIds.length === 0
    || selectedCartItemIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
  ) {
    redirect('/cart');
  }

  const user = await getSessionUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/checkout?items=${selectedCartItemIds.join(',')}`)}`);
  }

  const supabase = await supabaseServer();
  let profileResult = await supabase
    .from('users')
    .select('full_name, phone, address, default_shipping_address')
    .eq('id', user.id)
    .maybeSingle();
  if (profileResult.error && isMissingSavedAddressColumn(profileResult.error)) {
    profileResult = await supabase
      .from('users')
      .select('full_name, phone, address')
      .eq('id', user.id)
      .maybeSingle();
  }
  if (profileResult.error) console.error('[checkout:profile-read]', profileResult.error.message);

  const { data: recentOrders } = await supabase
      .from('orders')
      .select('shipping_address')
      .eq('customer_id', user.id)
      .eq('order_level', 'PARENT')
      .order('placed_at', { ascending: false })
      .limit(1);
  const profile = asRecord(profileResult.data);
  const latestAddress = asRecord(recentOrders?.[0]?.shipping_address);
  const savedAddress = asRecord(profile.default_shipping_address);
  const sources = [savedAddress, latestAddress];
  const firstValue = (key: string) => sources.map(source => stringValue(source, key)).find(Boolean) ?? '';

  const savedLocation = sources.map(source => {
    const province = stringValue(source, 'province_code') || findVietnameseProvinceCode(stringValue(source, 'city'));
    const commune = stringValue(source, 'commune_code')
      || findVietnameseCommuneCode(stringValue(source, 'ward'), province);
    const names = getVietnameseAddressNames(province, commune);
    return names ? { province, commune } : null;
  }).find(Boolean);
  const initialAddress: CheckoutAddressValues = {
    receiverName: firstValue('receiver_name') || stringValue(profile, 'full_name'),
    phone: stringValue(profile, 'phone') || firstValue('phone'),
    address: firstValue('address') || stringValue(profile, 'address'),
    provinceCode: savedLocation?.province ?? '',
    communeCode: savedLocation?.commune ?? '',
    note: firstValue('note'),
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Thông tin giao nhận</h1>
      <p className="mt-1 text-sm text-slate-500">
        Đang đặt {selectedCartItemIds.length} sản phẩm đã chọn. Hệ thống sẽ tách đơn theo từng doanh nghiệp; phí giao nhận (nếu có) được áp theo từng doanh nghiệp.
      </p>
      <div className="mt-6">
        <CheckoutForm
          selectedCartItemIds={selectedCartItemIds}
          initialAddress={initialAddress}
        />
      </div>
    </div>
  );
}
