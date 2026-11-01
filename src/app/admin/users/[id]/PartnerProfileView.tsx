import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { formatDate, formatVnd } from '@/lib/money';

interface PartnerProfileViewProps {
  user: {
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    status: string;
  };

  partner: {
    user_id: string;
    business_name: string;
    business_license_no: string;
    tax_code: string | null;
    address: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    selling_status: string;
    created_at: string;
  };
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  price: number | string;
  status: string;
  created_at: string;

  product_availability: {
    available_qty: number;
    reserved_qty: number;
    supply_status: string;
  } | null;

  product_images: {
    url: string;
    sort_order: number;
  }[] | null;
}

interface WorkshopRegistrationRow {
  status: string;
}

interface WorkshopSessionRow {
  id: string;
  starts_at: string;
  ends_at: string;
  location: string;
  fee: number | string;
  capacity: number;
  remaining_seats: number;
  status: string;

  workshop_registrations: WorkshopRegistrationRow[] | null;
}

interface WorkshopRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  created_at: string;

  workshop_sessions: WorkshopSessionRow[] | null;
}

interface SettlementRow {
  gross_amount: number | string;
  platform_fee: number | string;
  net_payable: number | string;
  status: string;

  payouts: {
    amount: number | string;
  }[] | null;
}

const recognizedOrderStatuses = [
  'COMPLETED',
  'DELIVERED',
  'SHIPPED',
  'PROCESSING',
  'ACCEPTED',
  'PENDING_ACCEPTANCE',
  'PAID',
];

const productStatusLabels: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đang đăng bán',
  REJECTED: 'Bị từ chối',
  UNLISTED: 'Đã gỡ',
};

function partnerStatusLabel(
  sellingStatus: string,
  accountStatus: string
) {
  if (
    accountStatus === 'BLOCKED' ||
    sellingStatus === 'SUSPENDED'
  ) {
    return 'Ngừng hoạt động';
  }

  if (sellingStatus === 'PENDING') {
    return 'Chờ duyệt';
  }

  if (sellingStatus === 'REJECTED') {
    return 'Bị từ chối';
  }

  if (sellingStatus === 'APPROVED') {
    return 'Đang hoạt động';
  }

  return 'Chưa đăng ký hoạt động';
}

function workshopSessionStatus(
  session: WorkshopSessionRow,
  now: number
) {
  if (session.status === 'CANCELLED') {
    return 'Đã hủy';
  }

  if (new Date(session.ends_at).getTime() < now) {
    return 'Đã quá hạn';
  }

  if (new Date(session.starts_at).getTime() > now) {
    return 'Chưa tới ngày';
  }

  return 'Đang diễn ra';
}

function sessionSoldCount(session: WorkshopSessionRow) {
  return (session.workshop_registrations ?? []).filter(
    (registration) =>
      registration.status === 'CONFIRMED' ||
      registration.status === 'COMPLETED'
  ).length;
}

export async function PartnerProfileView({
  user,
  partner,
}: PartnerProfileViewProps) {
  const supabase = await supabaseServer();

  const [
    { count: listedProductCount, error: listedProductsError },
    { count: orderCount, error: ordersCountError },
    { count: workshopCount, error: workshopsCountError },
    { data: settlementData, error: settlementsError },
    { data: productData, error: productsError },
    { data: workshopData, error: workshopsError },
  ] = await Promise.all([
    // Số sản phẩm đang đăng bán.
    supabase
      .from('products')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('partner_id', partner.user_id)
      .eq('status', 'APPROVED'),

    // Tổng số đơn hàng của đối tác.
    supabase
      .from('orders')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('partner_id', partner.user_id)
      .eq('order_level', 'CHILD'),

    // Tổng số workshop.
    supabase
      .from('workshops')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('partner_id', partner.user_id),

    // Thông tin đối soát.
    supabase
      .from('settlement_statements')
      .select(`
        gross_amount,
        platform_fee,
        net_payable,
        status,
        payouts(amount)
      `)
      .eq('partner_id', partner.user_id),

    // Danh sách sản phẩm gần đây.
    supabase
      .from('products')
      .select(`
        id,
        name,
        slug,
        short_description,
        description,
        price,
        status,
        created_at,
        product_availability(
          available_qty,
          reserved_qty,
          supply_status
        ),
        product_images(
          url,
          sort_order
        )
      `)
      .eq('partner_id', partner.user_id)
      .order('created_at', {
        ascending: false,
      })
      .limit(5),

    // Danh sách workshop gần đây.
    supabase
      .from('workshops')
      .select(`
        id,
        title,
        slug,
        description,
        status,
        created_at,
        workshop_sessions(
          id,
          starts_at,
          ends_at,
          location,
          fee,
          capacity,
          remaining_seats,
          status,
          workshop_registrations(status)
        )
      `)
      .eq('partner_id', partner.user_id)
      .order('created_at', {
        ascending: false,
      })
      .limit(5),
  ]);

  // Kiểm tra lỗi truy vấn.
  if (listedProductsError) {
    throw new Error(listedProductsError.message);
  }

  if (ordersCountError) {
    throw new Error(ordersCountError.message);
  }

  if (workshopsCountError) {
    throw new Error(workshopsCountError.message);
  }

  if (settlementsError) {
    throw new Error(settlementsError.message);
  }

  if (productsError) {
    throw new Error(productsError.message);
  }

  if (workshopsError) {
    throw new Error(workshopsError.message);
  }

  const products = (
    productData ?? []
  ) as unknown as ProductRow[];

  const workshops = (
    workshopData ?? []
  ) as unknown as WorkshopRow[];

  const settlements = (
    settlementData ?? []
  ) as unknown as SettlementRow[];

  // Tính số lượng sản phẩm đã bán.
  const productSales = await Promise.all(
    products.map(async (product) => {
      const { data, error } = await supabase
        .from('order_items')
        .select('qty, orders!inner(status)')
        .eq('product_id', product.id)
        .in(
          'orders.status',
          recognizedOrderStatuses
        );

      if (error) {
        throw new Error(error.message);
      }

      return [
        product.id,
        (data ?? []).reduce(
          (total, item) => total + item.qty,
          0
        ),
      ] as const;
    })
  );

  const soldByProduct = new Map(productSales);

  // Tổng doanh thu.
  const grossRevenue = settlements.reduce(
    (total, statement) =>
      total + Number(statement.gross_amount),
    0
  );

  // Tổng phí nền tảng.
  const platformFees = settlements.reduce(
    (total, statement) =>
      total + Number(statement.platform_fee),
    0
  );

  // Tổng tiền đã thanh toán cho đối tác.
  const totalPaid = settlements.reduce(
    (total, statement) =>
      total +
      (statement.payouts ?? []).reduce(
        (paid, payout) =>
          paid + Number(payout.amount),
        0
      ),
    0
  );

  // Số tiền còn phải thanh toán.
  const remainingPayment = settlements.reduce(
    (total, statement) => {
      const paid = (
        statement.payouts ?? []
      ).reduce(
        (sum, payout) =>
          sum + Number(payout.amount),
        0
      );

      return (
        total +
        Math.max(
          Number(statement.net_payable) - paid,
          0
        )
      );
    },
    0
  );

  // Trạng thái đối soát.
  const reconciliationStatus =
    settlements.length === 0
      ? 'Chưa có kỳ đối soát'
      : settlements.some(
            (statement) =>
              statement.status === 'DRAFT'
          )
        ? 'Chờ xác nhận đối soát'
        : remainingPayment > 0
          ? 'Còn phải thanh toán'
          : 'Đã thanh toán';

  const now = new Date().getTime();

  const businessStatus = partnerStatusLabel(
    partner.selling_status,
    user.status
  );

  return (
    <div>
      {/* Quay lại danh sách đối tác */}
      <Link
        href="/admin/users?role=PARTNER"
        className="text-sm font-medium text-emerald-800 hover:underline"
      >
        ← Quay lại danh sách đối tác
      </Link>

      {/* Thông tin doanh nghiệp */}
      <header className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              Hồ sơ doanh nghiệp đối tác
            </p>

            <h1 className="mt-1 text-2xl font-bold">
              {partner.business_name}
            </h1>
          </div>

          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            {businessStatus}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-500">
              Mã doanh nghiệp / đối tác
            </dt>
            <dd className="break-all font-mono text-xs">
              {partner.user_id}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Tên doanh nghiệp
            </dt>
            <dd>{partner.business_name}</dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Người đại diện
            </dt>
            <dd>
              {user.full_name || 'Chưa cập nhật'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Email liên hệ
            </dt>
            <dd>
              {partner.contact_email ||
                user.email ||
                'Chưa cập nhật'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Số điện thoại
            </dt>
            <dd>
              {partner.contact_phone ||
                user.phone ||
                'Chưa cập nhật'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Địa chỉ trụ sở
            </dt>
            <dd>
              {partner.address || 'Chưa cập nhật'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Số giấy phép kinh doanh
            </dt>
            <dd>
              {partner.business_license_no ||
                'Chưa cập nhật'}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Mã số thuế
            </dt>
            <dd>{partner.tax_code || 'Chưa cập nhật'}</dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Ngày đăng ký đối tác
            </dt>
            <dd>{formatDate(partner.created_at)}</dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Trạng thái tài khoản
            </dt>
            <dd>
              {user.status === 'ACTIVE'
                ? 'Đang hoạt động'
                : 'Đã khóa'}
            </dd>
          </div>
        </dl>
      </header>

      {/* Thống kê hoạt động kinh doanh */}
      <section
        aria-label="Thông tin hoạt động kinh doanh"
        className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {[
          {
            label: 'Sản phẩm đang đăng bán',
            value: listedProductCount ?? 0,
          },
          {
            label: 'Tổng đơn hàng phát sinh',
            value: orderCount ?? 0,
          },
          {
            label: 'Tổng doanh thu được ghi nhận',
            value: formatVnd(grossRevenue),
          },
          {
            label: 'Tổng workshop đã tạo',
            value: workshopCount ?? 0,
          },
          {
            label: 'Trạng thái kinh doanh',
            value: businessStatus,
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

      {/* Thông tin đối soát */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">
          Thông tin đối soát
        </h2>

        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-slate-500">
              Tổng doanh thu được ghi nhận
            </dt>
            <dd className="font-semibold">
              {formatVnd(grossRevenue)}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Tổng phí nền tảng
            </dt>
            <dd className="font-semibold">
              {formatVnd(platformFees)}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Tổng tiền đã thanh toán
            </dt>
            <dd className="font-semibold">
              {formatVnd(totalPaid)}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Còn phải thanh toán
            </dt>
            <dd className="font-semibold">
              {formatVnd(remainingPayment)}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">
              Trạng thái đối soát
            </dt>
            <dd className="font-semibold">
              {reconciliationStatus}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-slate-500">
          Doanh thu, phí và khoản phải trả được tổng hợp
          từ các kỳ đối soát đã tạo trong hệ thống.
        </p>
      </section>

      {/* Sản phẩm gần đây */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Sản phẩm gần đây
          </h2>

          <Link
            href={`/admin/products?partner=${partner.user_id}`}
            className="text-sm font-medium text-emerald-800 hover:underline"
          >
            Xem tất cả sản phẩm
          </Link>
        </div>

        <p className="mt-1 text-xs text-slate-500">
          Tồn khả dụng là số lượng doanh nghiệp khai báo
          có thể cung cấp; số đã giữ được hiển thị riêng.
        </p>

        <div className="mt-3 space-y-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/admin/products/${product.id}`}
                  className="font-semibold text-emerald-800 hover:underline"
                >
                  {product.name}
                </Link>

                <span className="text-sm text-slate-500">
                  {productStatusLabels[product.status] ??
                    product.status}
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-600">
                {formatVnd(product.price)} · Đã bán{' '}
                {soldByProduct.get(product.id) ?? 0}{' '}
                sản phẩm · Tạo{' '}
                {formatDate(product.created_at)}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Còn có thể bán{' '}
                {Math.max(
                  (product.product_availability?.available_qty ??
                    0) -
                    (product.product_availability?.reserved_qty ??
                      0),
                  0
                )}
                {' · '}Đã giữ{' '}
                {product.product_availability?.reserved_qty ??
                  0}
                {' · '}
                {product.product_availability?.supply_status ??
                  'Chưa khai báo cung ứng'}
              </p>

              {(product.short_description ||
                product.description) && (
                <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-slate-600">
                  {product.short_description ||
                    product.description}
                </p>
              )}
            </article>
          ))}

          {products.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500">
              Doanh nghiệp chưa có sản phẩm.
            </p>
          )}
        </div>
      </section>

      {/* Workshop gần đây */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Workshop gần đây
          </h2>

          <Link
            href={`/admin/workshops?partner=${partner.user_id}`}
            className="text-sm font-medium text-emerald-800 hover:underline"
          >
            Xem tất cả workshop
          </Link>
        </div>

        <div className="mt-3 space-y-3">
          {workshops.map((workshop) => (
            <article
              key={workshop.id}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <Link
                href={`/admin/workshops/${workshop.id}`}
                className="font-semibold text-emerald-800 hover:underline"
              >
                {workshop.title}
              </Link>

              <p className="mt-1 text-sm text-slate-500">
                {workshop.status} · Tạo{' '}
                {formatDate(workshop.created_at)}
              </p>

              {workshop.description && (
                <p className="mt-2 text-sm text-slate-600">
                  {workshop.description}
                </p>
              )}

              <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                {(workshop.workshop_sessions ?? []).map(
                  (session) => {
                    const sold = sessionSoldCount(session);

                    return (
                      <li
                        key={session.id}
                        className="text-sm"
                      >
                        <p className="font-medium">
                          {formatDate(session.starts_at)} –{' '}
                          {formatDate(session.ends_at)}
                          {' · '}
                          {workshopSessionStatus(
                            session,
                            now
                          )}
                        </p>

                        <p className="text-xs text-slate-500">
                          {session.location} ·{' '}
                          {formatVnd(session.fee)} · Đã bán{' '}
                          {sold}/{session.capacity} vé
                          {' · '}Còn trống{' '}
                          {session.remaining_seats}
                        </p>
                      </li>
                    );
                  }
                )}

                {(workshop.workshop_sessions ?? []).length ===
                  0 && (
                  <li className="text-xs text-slate-500">
                    Chưa có lịch tổ chức.
                  </li>
                )}
              </ul>
            </article>
          ))}

          {workshops.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500">
              Doanh nghiệp chưa có workshop.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}