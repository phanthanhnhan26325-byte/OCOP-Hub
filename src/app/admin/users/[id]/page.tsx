import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/rbac';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';
import { PartnerProfileView } from './PartnerProfileView';

export const dynamic = 'force-dynamic';

interface AdminUserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
  user_roles: { role: string }[] | null;
  partner_profiles: PartnerProfileRow[] | PartnerProfileRow | null;
}

interface PartnerProfileRow {
  business_name: string;
  business_license_no: string;
  tax_code: string | null;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  selling_status: string;
  created_at: string;
}

interface AdminOrder {
  id: string;
  code: string;
  status: string;
  total: number | string;
  placed_at: string;
  orders_child: {
    id: string;
    code: string;
    status: string;
    total: number | string;
    order_items: {
      product_name: string;
      qty: number;
      line_total: number | string;
    }[] | null;
  }[] | null;
}

interface AdminRegistration {
  id: string;
  code: string;
  status: string;
  amount: number | string;
  created_at: string;
  workshop_sessions: {
    starts_at: string;
    location: string;
    workshops: { title: string } | null;
  } | null;
}

interface AdminPayment {
  id: string;
  purpose: string;
  reference_id: string;
  amount: number | string;
  refunded_amount: number | string;
  status: string;
  created_at: string;
}

interface AdminRefund {
  id: string;
  payment_id: string;
  ref_type: string;
  ref_id: string;
  amount: number | string;
  reason: string | null;
  status: string;
  created_at: string;
}

function isMissingAddressColumn(error: {
  code?: string;
  message?: string;
}) {
  const message = error.message?.toLowerCase() ?? '';

  return (
    message.includes('address') &&
    (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      message.includes('does not exist') ||
      message.includes('schema cache')
    )
  );
}

const orderStatusLabels: Record<string, string> = {
  CREATED: 'Mới tạo',
  PAYMENT_PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PENDING_ACCEPTANCE: 'Chờ xác nhận',
  ACCEPTED: 'Đã xác nhận',
  PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao',
  COMPLETED: 'Thành công',
  REJECTED_BY_PARTNER: 'Đối tác từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  PARTIALLY_REFUNDED: 'Đã hoàn một phần',
};

const registrationStatusLabels: Record<string, string> = {
  PENDING: 'Chờ thanh toán',
  PAYMENT_PROCESSING: 'Đang xử lý thanh toán',
  CONFIRMED: 'Đã đăng ký',
  CANCELLED_PAYMENT_FAILED: 'Thanh toán thất bại',
  CANCELLED_BY_CUSTOMER: 'Khách hàng đã hủy',
  CANCELLED_BY_PARTNER: 'Đối tác đã hủy',
  REFUNDED: 'Đã hoàn tiền',
  COMPLETED: 'Đã tham gia',
};

const paymentStatusLabels: Record<string, string> = {
  CREATED: 'Mới tạo',
  PENDING: 'Đang chờ',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  EXPIRED: 'Hết hạn',
  REFUNDED: 'Đã hoàn tiền',
  PARTIALLY_REFUNDED: 'Đã hoàn một phần',
  CANCELLED: 'Đã hủy',
};

function statusLabel(
  status: string,
  labels: Record<string, string>
) {
  return labels[status] ?? status;
}

export default async function AdminUserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('ADMIN');

  const { id } = await params;
  const supabase = await supabaseServer();

  const readUser = async () => {
    let result = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
        phone,
        address,
        status,
        created_at,
        user_roles(role),
        partner_profiles!partner_profiles_user_id_fkey(
          business_name,
          business_license_no,
          tax_code,
          address,
          contact_email,
          contact_phone,
          selling_status,
          created_at
        )
      `)
      .eq('id', id)
      .maybeSingle();

    let addressUnavailable = false;

    // Nếu bảng users không có cột address,
    // thực hiện truy vấn lại nhưng bỏ cột users.address.
    if (result.error && isMissingAddressColumn(result.error)) {
      result = await supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          phone,
          status,
          created_at,
          user_roles(role),
          partner_profiles!partner_profiles_user_id_fkey(
            business_name,
            business_license_no,
            tax_code,
            address,
            contact_email,
            contact_phone,
            selling_status,
            created_at
          )
        `)
        .eq('id', id)
        .maybeSingle();

      addressUnavailable = !result.error;
    }

    return {
      ...result,
      addressUnavailable,
    };
  };

  const {
    data: userData,
    error: userError,
    addressUnavailable,
  } = await readUser();

  if (userError) {
    console.error('Admin user profile query error:', userError);
    throw new Error(userError.message);
  }

  if (!userData) {
    notFound();
  }

  const user = userData as unknown as AdminUserProfile;

  const roleNames = (user.user_roles ?? []).map(
    (role) => role.role
  );

  const partner = Array.isArray(user.partner_profiles)
    ? user.partner_profiles[0]
    : user.partner_profiles;

  // Tài khoản đối tác chưa có hồ sơ doanh nghiệp.
  if (roleNames.includes('PARTNER') && !partner) {
    return (
      <div>
        <Link
          href="/admin/users?role=PARTNER"
          className="text-sm font-medium text-emerald-800 hover:underline"
        >
          ← Quay lại danh sách đối tác
        </Link>

        <h1 className="mt-4 text-2xl font-bold">
          {user.full_name || 'Tài khoản đối tác'}
        </h1>

        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Tài khoản này chưa có hồ sơ doanh nghiệp.
          Thông tin hoạt động kinh doanh chưa khả dụng.
        </p>
      </div>
    );
  }

  // Hiển thị trang hồ sơ riêng cho đối tác.
  if (roleNames.includes('PARTNER') && partner) {
    return (
      <PartnerProfileView
        user={{
          id: user.id,
          full_name: user.full_name,
          email: user.email,
          phone: user.phone,
          status: user.status,
        }}
        partner={{
          ...partner,
          user_id: user.id,
        }}
      />
    );
  }

  // Lấy lịch sử đơn hàng, workshop và thanh toán.
  const [
    { data: orderData, error: ordersError },
    { data: registrationData, error: registrationsError },
    { data: paymentData, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id,
        code,
        status,
        total,
        placed_at,
        orders_child:orders!parent_order_id(
          id,
          code,
          status,
          total,
          order_items(
            product_name,
            qty,
            line_total
          )
        )
      `)
      .eq('customer_id', id)
      .eq('order_level', 'PARENT')
      .order('placed_at', { ascending: false })
      .limit(200),

    supabase
      .from('workshop_registrations')
      .select(`
        id,
        code,
        status,
        amount,
        created_at,
        workshop_sessions(
          starts_at,
          location,
          workshops(title)
        )
      `)
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(200),

    supabase
      .from('payments')
      .select(`
        id,
        purpose,
        reference_id,
        amount,
        refunded_amount,
        status,
        created_at
      `)
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (ordersError) {
    throw new Error(ordersError.message);
  }

  if (registrationsError) {
    throw new Error(registrationsError.message);
  }

  if (paymentsError) {
    throw new Error(paymentsError.message);
  }

  const orders = (orderData ?? []) as unknown as AdminOrder[];

  const registrations = (
    registrationData ?? []
  ) as unknown as AdminRegistration[];

  const payments = (
    paymentData ?? []
  ) as unknown as AdminPayment[];

  // Lấy lịch sử hoàn tiền.
  const paymentIds = payments.map(
    (payment) => payment.id
  );

  let refunds: AdminRefund[] = [];

  if (paymentIds.length > 0) {
    const {
      data: refundData,
      error: refundsError,
    } = await supabase
      .from('refunds')
      .select(`
        id,
        payment_id,
        ref_type,
        ref_id,
        amount,
        reason,
        status,
        created_at
      `)
      .in('payment_id', paymentIds)
      .order('created_at', { ascending: false })
      .limit(500);

    if (refundsError) {
      throw new Error(refundsError.message);
    }

    refunds = (
      refundData ?? []
    ) as unknown as AdminRefund[];
  }

  // Tính tổng tiền đã thanh toán.
  const paidStatuses = new Set([
    'PAID',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
  ]);

  const totalPaid = payments
    .filter((payment) =>
      paidStatuses.has(payment.status)
    )
    .reduce(
      (total, payment) =>
        total + Number(payment.amount),
      0
    );

  // Tính tổng tiền đã hoàn.
  const totalRefunded = refunds
    .filter((refund) =>
      refund.status === 'COMPLETED'
    )
    .reduce(
      (total, refund) =>
        total + Number(refund.amount),
      0
    );

  // Số đơn hàng đang giao.
  const inDeliveryCount = orders.reduce(
    (count, order) =>
      count +
      (order.orders_child ?? []).filter(
        (child) => child.status === 'SHIPPED'
      ).length,
    0
  );

  // Số đơn hàng thành công.
  const completedOrderCount = orders.reduce(
    (count, order) =>
      count +
      (order.orders_child ?? []).filter(
        (child) => child.status === 'COMPLETED'
      ).length,
    0
  );

  // Xác định các đơn hàng đã hoàn tiền.
  const refundedOrderIds = new Set(
    refunds
      .filter(
        (refund) =>
          refund.status === 'COMPLETED' &&
          refund.ref_type === 'ORDER'
      )
      .map((refund) => refund.ref_id)
  );

  const refundedOrderCount = orders.filter(
    (order) =>
      refundedOrderIds.has(order.id) ||
      (order.orders_child ?? []).some(
        (child) =>
          refundedOrderIds.has(child.id)
      )
  ).length;

  return (
    <div>
      <Link
        href="/admin/users"
        className="text-sm font-medium text-emerald-800 hover:underline"
      >
        ← Quay lại danh sách tài khoản
      </Link>

      {/* Thông tin tài khoản */}
      <header className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              {user.full_name || 'Chưa cập nhật tên'}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {user.email} ·{' '}
              {roleNames.join(', ') || 'Chưa có vai trò'}
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
            {user.status}
          </span>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">
              Mã tài khoản
            </dt>
            <dd className="break-all font-mono text-xs">
              {user.id}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Số điện thoại
            </dt>
            <dd>
              {user.phone || 'Chưa cập nhật'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Địa chỉ cá nhân
            </dt>
            <dd>
              {addressUnavailable
                ? 'Chưa khả dụng trên phiên bản dữ liệu này'
                : user.address || 'Chưa cập nhật'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Ngày tham gia
            </dt>
            <dd>{formatDate(user.created_at)}</dd>
          </div>
        </dl>

        {/* Thông tin đối tác nếu có */}
        {partner && (
          <section className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="font-semibold">
              Thông tin đối tác
            </h2>

            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">
                  Tên doanh nghiệp
                </dt>
                <dd>{partner.business_name}</dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  Mã số giấy phép
                </dt>
                <dd>{partner.business_license_no}</dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  Email liên hệ
                </dt>
                <dd>
                  {partner.contact_email || 'Chưa cập nhật'}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  Điện thoại liên hệ
                </dt>
                <dd>
                  {partner.contact_phone || 'Chưa cập nhật'}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  Địa chỉ doanh nghiệp
                </dt>
                <dd>
                  {partner.address || 'Chưa cập nhật'}
                </dd>
              </div>

              <div>
                <dt className="text-slate-500">
                  Trạng thái kinh doanh
                </dt>
                <dd>{partner.selling_status}</dd>
              </div>
            </dl>
          </section>
        )}
      </header>

      {/* Tổng quan giao dịch */}
      <section
        aria-label="Tổng quan giao dịch"
        className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {[
          {
            label: 'Đơn hàng đang giao',
            value: inDeliveryCount,
          },
          {
            label: 'Đơn hàng thành công',
            value: completedOrderCount,
          },
          {
            label: 'Đơn hàng có hoàn tiền',
            value: refundedOrderCount,
          },
          {
            label: 'Đã thanh toán',
            value: formatVnd(totalPaid),
          },
          {
            label: 'Đã được hoàn',
            value: formatVnd(totalRefunded),
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-xs text-slate-500">
              {item.label}
            </p>
            <p className="mt-1 font-semibold">
              {item.value}
            </p>
          </div>
        ))}
      </section>

      {/* Lịch sử mua hàng */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Lịch sử mua hàng / đơn hàng
        </h2>

        <div className="mt-3 space-y-3">
          {orders.map((order) => (
            <article
              key={order.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold">
                    {order.code}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDate(order.placed_at)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-semibold">
                    {formatVnd(order.total)}
                  </p>

                  <p className="text-xs text-slate-500">
                    {refundedOrderIds.has(order.id)
                      ? 'Đã hoàn tiền'
                      : statusLabel(
                          order.status,
                          orderStatusLabels
                        )}
                  </p>
                </div>
              </div>

              {(order.orders_child ?? []).map(
                (child) => (
                  <div
                    key={child.id}
                    className="mt-3 border-t border-slate-100 pt-3"
                  >
                    <p className="text-xs font-medium">
                      {child.code} ·{' '}
                      {refundedOrderIds.has(child.id)
                        ? 'Đã hoàn tiền'
                        : statusLabel(
                            child.status,
                            orderStatusLabels
                          )}{' '}
                      · {formatVnd(child.total)}
                    </p>

                    <ul className="mt-1 space-y-1 text-xs text-slate-600">
                      {(child.order_items ?? []).map(
                        (item, index) => (
                          <li
                            key={`${child.id}-${index}`}
                            className="flex justify-between gap-2"
                          >
                            <span>
                              {item.product_name} × {item.qty}
                            </span>
                            <span>
                              {formatVnd(item.line_total)}
                            </span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )
              )}
            </article>
          ))}

          {orders.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500">
              Chưa có đơn hàng.
            </p>
          )}
        </div>
      </section>

      {/* Lịch sử workshop */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Lịch sử đăng ký workshop
        </h2>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Workshop</th>
                <th className="px-4 py-3">Buổi học</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>

            <tbody>
              {registrations.map((registration) => {
                const session =
                  registration.workshop_sessions;

                return (
                  <tr
                    key={registration.id}
                    className="border-b border-slate-50"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {session?.workshops?.title || 'Workshop'}
                      </p>

                      <p className="text-xs text-slate-500">
                        {registration.code} ·{' '}
                        {formatDate(registration.created_at)}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {session
                        ? `${formatDate(session.starts_at)} · ${session.location}`
                        : '—'}
                    </td>

                    <td className="px-4 py-3">
                      {formatVnd(registration.amount)}
                    </td>

                    <td className="px-4 py-3">
                      {statusLabel(
                        registration.status,
                        registrationStatusLabels
                      )}
                    </td>
                  </tr>
                );
              })}

              {registrations.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-5 text-center text-slate-500"
                  >
                    Chưa đăng ký workshop.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Lịch sử thanh toán */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Thanh toán
        </h2>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-100 text-slate-500">
              <tr>
                <th className="px-4 py-3">Loại giao dịch</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3">Số tiền</th>
                <th className="px-4 py-3">Đã hoàn</th>
                <th className="px-4 py-3">Trạng thái</th>
              </tr>
            </thead>

            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b border-slate-50"
                >
                  <td className="px-4 py-3">
                    {payment.purpose === 'ORDER'
                      ? 'Đơn hàng'
                      : 'Đăng ký workshop'}

                    <p className="font-mono text-xs text-slate-400">
                      {payment.reference_id}
                    </p>
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(payment.created_at)}
                  </td>

                  <td className="px-4 py-3">
                    {formatVnd(payment.amount)}
                  </td>

                  <td className="px-4 py-3">
                    {formatVnd(payment.refunded_amount)}
                  </td>

                  <td className="px-4 py-3">
                    {statusLabel(
                      payment.status,
                      paymentStatusLabels
                    )}
                  </td>
                </tr>
              ))}

              {payments.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-5 text-center text-slate-500"
                  >
                    Chưa có giao dịch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Lịch sử hoàn tiền */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">
          Lịch sử hoàn tiền
        </h2>

        <div className="mt-3 space-y-2">
          {refunds.map((refund) => (
            <article
              key={refund.id}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <p>
                  {refund.ref_type} ·{' '}
                  {refund.ref_id.slice(0, 8)} ·{' '}
                  {formatDate(refund.created_at)}
                </p>

                <p className="font-semibold">
                  {formatVnd(refund.amount)} · {refund.status}
                </p>
              </div>

              {refund.reason && (
                <p className="mt-1 text-xs text-slate-500">
                  {refund.reason}
                </p>
              )}
            </article>
          ))}

          {refunds.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500">
              Chưa có khoản hoàn tiền.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}