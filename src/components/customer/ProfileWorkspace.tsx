'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProfileSidebar, type ProfileTabId } from './ProfileSidebar';
import { CustomerOrderActions } from './CustomerOrderActions';
import type { OrderServiceRequest } from '@/modules/orders/order-service-requests';

type Relation<T> = T | T[] | null;

export type ProfileOrder = {
  id: string;
  code: string;
  status: string;
  total: number | string;
  placed_at: string;
  shipping_address: Record<string, unknown>;
  orders_child: Array<{
    id: string;
    code: string;
    status: string;
    total: number | string;
    partner_profiles: Relation<{ business_name: string }>;
    order_items: Array<{
      id: string;
      product_id: string;
      product_name: string;
      product_image: string | null;
      qty: number;
      unit_price: number | string;
      line_total: number | string;
      products: Relation<{ slug: string }>;
    }>;
    order_status_history: Array<{ to_status: string; created_at: string; reason: string | null }>;
    order_service_requests: OrderServiceRequest[];
  }> | null;
};

export type ProfileRegistration = {
  id: string;
  code: string;
  status: string;
  amount: number | string;
  created_at: string;
  workshop_sessions: Relation<{
    starts_at: string;
    ends_at: string;
    location: string;
    workshops: Relation<{
      title: string;
      slug: string;
      cover_image: string | null;
      partner_profiles: Relation<{ business_name: string }>;
    }>;
  }>;
};

type Profile = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
  createdAt: string;
};

const orderLabels: Record<string, string> = {
  CREATED: 'Mới tạo',
  PAYMENT_PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  PENDING_ACCEPTANCE: 'Chờ xác nhận',
  ACCEPTED: 'Đã xác nhận',
  PROCESSING: 'Đang xử lý',
  SHIPPED: 'Đang giao hàng',
  DELIVERED: 'Đã giao hàng',
  COMPLETED: 'Hoàn tất',
  RETURNED: 'Đã nhận lại hàng',
  REJECTED_BY_PARTNER: 'Bị từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  PARTIALLY_REFUNDED: 'Hoàn tiền một phần',
};

const registrationLabels: Record<string, string> = {
  PENDING: 'Chờ thanh toán',
  PAYMENT_PROCESSING: 'Đang xử lý',
  CONFIRMED: 'Đã xác nhận',
  CANCELLED_PAYMENT_FAILED: 'Thanh toán thất bại',
  CANCELLED_BY_CUSTOMER: 'Bạn đã hủy',
  CANCELLED_BY_PARTNER: 'Đơn vị tổ chức đã hủy',
  REFUNDED: 'Đã hoàn tiền',
  COMPLETED: 'Đã tham gia',
};

function relationOne<T>(value: Relation<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string') return error;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return fallback;
}

function formatMoney(value: number | string) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));
}

function formatDate(value: string, withTime = false) {
  if (!value) return 'Chưa cập nhật';
  return new Intl.DateTimeFormat('vi-VN', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'long' }).format(new Date(value));
}

function statusTone(status: string) {
  if (['DELIVERED', 'COMPLETED', 'CONFIRMED'].includes(status)) return 'bg-[#e6f4e9] text-[#236340]';
  if (['SHIPPED', 'PROCESSING', 'ACCEPTED', 'PENDING_ACCEPTANCE', 'PAYMENT_PROCESSING'].includes(status)) return 'bg-[#e8f1f8] text-[#315b7a]';
  if (status.startsWith('CANCELLED') || status === 'REJECTED_BY_PARTNER' || status === 'EXPIRED') return 'bg-[#fcebea] text-[#9b3c32]';
  return 'bg-[#fbf1d7] text-[#7b5a16]';
}

function orderCategory(status: string) {
  if (['CREATED', 'PAYMENT_PENDING', 'PENDING_ACCEPTANCE'].includes(status)) return 'pending';
  if (['PAID', 'ACCEPTED'].includes(status)) return 'confirmed';
  if (['PROCESSING', 'SHIPPED'].includes(status)) return 'processing';
  if (['DELIVERED', 'COMPLETED'].includes(status)) return 'delivered';
  return 'cancelled';
}

function ProfileAvatar({ profile, size = 'large' }: { profile: Profile; size?: 'large' | 'small' }) {
  const sizeClass = size === 'large' ? 'h-24 w-24 text-3xl' : 'h-12 w-12 text-lg';
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#dce9d9] font-semibold text-[#1d4d38] shadow-sm`}>
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={`Ảnh đại diện ${profile.fullName}`} className="h-full w-full object-cover" />
      ) : (
        <span>{profile.fullName.trim().charAt(0).toUpperCase() || 'U'}</span>
      )}
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(status)}`}>{label}</span>;
}

function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10281f]/45 p-4" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} overflow-y-auto rounded-2xl border border-[#d7d0b8] bg-[#fffefa] p-5 shadow-2xl sm:p-7`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b border-[#e6e1d4] pb-4">
          <h2 className="text-xl font-semibold text-[#1d4d38]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-[#52675c] hover:bg-[#f1eee5]">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function ProfileWorkspace({
  profile: initialProfile,
  addressUnavailable = false,
  roles,
  orders,
  registrations,
  initialOrderId = null,
}: {
  profile: Profile;
  addressUnavailable?: boolean;
  roles: string[];
  orders: ProfileOrder[];
  registrations: ProfileRegistration[];
  initialOrderId?: string | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [activeTab, setActiveTab] = useState<ProfileTabId>('overview');
  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId);
  const [selectedRegistration, setSelectedRegistration] = useState<ProfileRegistration | null>(null);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('all');
  const [registrationStatus, setRegistrationStatus] = useState('all');
  const [showAllOrders, setShowAllOrders] = useState(false);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const [showAllRegistrations, setShowAllRegistrations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [formError, setFormError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [notice, setNotice] = useState(addressUnavailable
    ? 'Cơ sở dữ liệu chưa có cột users.address. Địa chỉ sẽ chỉ được lưu sau khi áp dụng migration 0004_customer_profile.sql.'
    : '');
  const [editValues, setEditValues] = useState({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
  });
  const [passwordValues, setPasswordValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const roleLabel = roles.includes('ADMIN') ? 'Quản trị viên' : roles.includes('PARTNER') ? 'Đối tác OCOP' : 'Khách hàng';

  const openEditor = () => {
    setEditValues({ fullName: profile.fullName, email: profile.email, phone: profile.phone, address: profile.address });
    setFormError('');
    setEditing(true);
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setNotice('');
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(getApiErrorMessage(result.error, 'Không thể lưu thông tin.'));
      setProfile((current) => ({
        ...current,
        fullName: editValues.fullName.trim(),
        phone: result.phone,
        address: result.addressSaved === false ? current.address : editValues.address.trim(),
      }));
      setEditing(false);
      setNotice(result.addressSaved === false
        ? 'Đã lưu các thông tin khác, nhưng địa chỉ chưa được lưu vì cơ sở dữ liệu thiếu cột users.address. Vui lòng áp dụng migration 0004_customer_profile.sql.'
        : result.emailConfirmationRequired
        ? 'Thông tin đã lưu. Hãy xác nhận email mới trong hộp thư để hoàn tất thay đổi.'
        : 'Thông tin cá nhân đã được cập nhật.');
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không thể lưu thông tin.');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setFormError('');
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const response = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(getApiErrorMessage(result.error, 'Không thể tải ảnh lên.'));
      setProfile((current) => ({ ...current, avatarUrl: result.avatarUrl }));
      setNotice('Ảnh đại diện đã được cập nhật.');
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không thể tải ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChanging(true);
    setPasswordError('');
    try {
      const response = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(passwordValues),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(getApiErrorMessage(result.error, 'Không thể đổi mật khẩu.'));
      setPasswordValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setChangingPassword(false);
      setNotice('Mật khẩu đã được cập nhật.');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Không thể đổi mật khẩu.');
    } finally {
      setChanging(false);
    }
  };

  const cancelRegistration = async (registration: ProfileRegistration) => {
    if (!window.confirm('Bạn có chắc muốn hủy đăng ký workshop này? Khoản đã thanh toán không thể tự hủy trên trang hồ sơ.')) return;
    setNotice('');
    try {
      const response = await fetch(`/api/workshops/registrations?registrationId=${encodeURIComponent(registration.id)}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Không thể hủy đăng ký.');
      setNotice('Đăng ký workshop đã được hủy.');
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Không thể hủy đăng ký.');
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = `${order.code} ${(order.orders_child ?? []).map((child) => child.code).join(' ')}`
      .toLowerCase().includes(orderSearch.trim().toLowerCase());
    const matchesStatus = orderStatus === 'all' || (order.orders_child ?? []).some((child) => orderCategory(child.status) === orderStatus);
    return matchesSearch && matchesStatus;
  });
  const visibleOrders = showAllOrders ? filteredOrders : filteredOrders.slice(0, 3);
  const filteredRegistrations = registrations.filter((registration) => registrationStatus === 'all' || registration.status === registrationStatus);
  const visibleRegistrations = showAllRegistrations ? filteredRegistrations : filteredRegistrations.slice(0, 3);

  const renderOrders = () => (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#66806e]">Giao dịch của bạn</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#1d4d38]">Lịch sử mua hàng</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_190px]">
          <label className="sr-only" htmlFor="order-search">Tìm mã đơn hàng</label>
          <input id="order-search" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Tìm mã đơn hàng" className="h-11 rounded-lg border border-[#d7d0b8] bg-white px-3 text-sm outline-none focus:border-[#1d4d38]" />
          <label className="sr-only" htmlFor="order-status">Lọc trạng thái đơn hàng</label>
          <select id="order-status" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)} className="h-11 rounded-lg border border-[#d7d0b8] bg-white px-3 text-sm text-[#294a3a] outline-none focus:border-[#1d4d38]">
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ xác nhận</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="processing">Đang xử lý / giao</option>
            <option value="delivered">Đã giao</option>
            <option value="cancelled">Đã hủy / hết hạn</option>
          </select>
        </div>
      </div>
      {visibleOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d7d0b8] bg-white/70 px-5 py-12 text-center">
          <p className="font-medium text-[#315342]">Chưa tìm thấy đơn hàng phù hợp</p>
          <Link href="/products" className="mt-2 inline-block text-sm font-semibold text-[#26704e] hover:underline">Khám phá sản phẩm OCOP</Link>
        </div>
      ) : (
        <div className="divide-y divide-[#e9e4d8] rounded-xl border border-[#e5dfd1] bg-white">
          {visibleOrders.map((order) => {
            const children = order.orders_child ?? [];
            const status = children[0]?.status ?? order.status;
            const itemCount = children.reduce((sum, child) => sum + child.order_items.reduce((count, item) => count + item.qty, 0), 0);
            const firstItem = children[0]?.order_items[0];
            return (
              <article key={order.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[#f1eee5]">
                    {firstItem?.product_image ? <img src={firstItem.product_image} alt={firstItem.product_name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-[#8b978d]">OCOP</div>}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#203c30]">{firstItem?.product_name ?? `${itemCount} sản phẩm`}</p>
                    <p className="mt-1 text-sm text-[#647469]">Mã đơn {order.code} · {formatDate(order.placed_at, true)}</p>
                    <p className="mt-1 text-xs text-[#758279]">{itemCount} sản phẩm · {(children[0] ? relationOne(children[0].partner_profiles)?.business_name : null) ?? 'Cơ sở OCOP'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <div className="sm:text-right">
                    <StatusBadge status={status} label={orderLabels[status] ?? status} />
                    <p className="mt-2 font-semibold text-[#1d4d38]">{formatMoney(order.total)}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedOrderId(order.id)} className="h-10 rounded-lg border border-[#bdd3c3] px-4 text-sm font-semibold text-[#1d6043] transition hover:bg-[#edf5ee]">Xem chi tiết</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {filteredOrders.length > 3 && (
        <button type="button" onClick={() => setShowAllOrders((value) => !value)} className="w-full py-2 text-sm font-semibold text-[#26704e] hover:underline">
          {showAllOrders ? 'Thu gọn danh sách' : `Xem tất cả ${filteredOrders.length} đơn hàng`}
        </button>
      )}
    </section>
  );

  const renderWorkshops = () => (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#66806e]">Trải nghiệm địa phương</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#1d4d38]">Lịch sử Workshop</h2>
        </div>
        <label className="sr-only" htmlFor="registration-status">Lọc trạng thái workshop</label>
        <select id="registration-status" value={registrationStatus} onChange={(event) => setRegistrationStatus(event.target.value)} className="h-11 rounded-lg border border-[#d7d0b8] bg-white px-3 text-sm text-[#294a3a] outline-none focus:border-[#1d4d38] sm:w-56">
          <option value="all">Tất cả trạng thái</option>
          <option value="PENDING">Chờ thanh toán</option>
          <option value="PAYMENT_PROCESSING">Đang xử lý</option>
          <option value="CONFIRMED">Đã xác nhận</option>
          <option value="COMPLETED">Đã tham gia</option>
          <option value="CANCELLED_BY_CUSTOMER">Đã hủy</option>
        </select>
      </div>
      {visibleRegistrations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d7d0b8] bg-white/70 px-5 py-12 text-center">
          <p className="font-medium text-[#315342]">Chưa có lịch Workshop phù hợp</p>
          <Link href="/workshops" className="mt-2 inline-block text-sm font-semibold text-[#26704e] hover:underline">Tìm trải nghiệm địa phương</Link>
        </div>
      ) : (
        <div className="divide-y divide-[#e9e4d8] rounded-xl border border-[#e5dfd1] bg-white">
          {visibleRegistrations.map((registration) => {
            const session = relationOne(registration.workshop_sessions);
            const workshop = relationOne(session?.workshops);
            const partner = relationOne(workshop?.partner_profiles);
            const cancellable = ['PENDING', 'PAYMENT_PROCESSING'].includes(registration.status);
            return (
              <article key={registration.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:px-5">
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-[#f1eee5]">
                  {workshop?.cover_image ? <img src={workshop.cover_image} alt={workshop.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-[#8b978d]">Workshop</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#203c30]">{workshop?.title ?? 'Workshop OCOP'}</p>
                  <p className="mt-1 text-sm text-[#647469]">{partner?.business_name ?? 'Đơn vị tổ chức'}</p>
                  <p className="mt-1 text-xs text-[#758279]">{session ? `${formatDate(session.starts_at, true)} · ${session.location}` : 'Chưa có lịch chi tiết'}</p>
                  <p className="mt-1 text-xs text-[#758279]">Mã đăng ký {registration.code} · 1 người</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <div className="sm:text-right">
                    <StatusBadge status={registration.status} label={registrationLabels[registration.status] ?? registration.status} />
                    <p className="mt-2 text-sm font-semibold text-[#1d4d38]">{formatMoney(registration.amount)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSelectedRegistration(registration)} className="h-10 rounded-lg border border-[#bdd3c3] px-4 text-sm font-semibold text-[#1d6043] transition hover:bg-[#edf5ee]">Chi tiết</button>
                    {registration.status === 'COMPLETED' && workshop?.slug && <Link href={`/workshops/${workshop.slug}#reviews`} className="inline-flex h-10 items-center rounded-lg bg-[#1d4d38] px-3 text-sm font-semibold text-white hover:bg-[#173d30]">Đánh giá</Link>}
                    {cancellable && <button type="button" onClick={() => void cancelRegistration(registration)} className="h-10 rounded-lg border border-[#e5c4ba] px-3 text-sm font-semibold text-[#91463b] transition hover:bg-[#fcf0ed]">Hủy</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {registrations.some((registration) => registration.status === 'CONFIRMED') && (
        <p className="text-xs leading-5 text-[#6d756e]">Đăng ký đã thanh toán không thể tự hủy tại đây. Vui lòng liên hệ đơn vị tổ chức để được hỗ trợ theo chính sách hoàn tiền.</p>
      )}
      {filteredRegistrations.length > 3 && (
        <button type="button" onClick={() => setShowAllRegistrations((value) => !value)} className="w-full py-2 text-sm font-semibold text-[#26704e] hover:underline">
          {showAllRegistrations ? 'Thu gọn danh sách' : `Xem tất cả ${filteredRegistrations.length} workshop`}
        </button>
      )}
    </section>
  );

  return (
    <div className="min-h-[70vh] bg-[#f7f4ec]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:flex-row lg:px-6">
        <ProfileSidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="min-w-0 flex-1">
        <section className="relative overflow-hidden rounded-2xl border border-[#d7d0b8] bg-[#f2ead4] p-5 sm:p-7 lg:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.42))] md:block" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProfileAvatar profile={profile} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#74856f]">Thành viên OCOP Hub</p>
              <h1 className="mt-1 break-words text-2xl font-semibold text-[#173e2f] sm:text-3xl">{profile.fullName || 'Chào mừng bạn'}</h1>
              <div className="mt-2 inline-flex rounded-full bg-[#e1efe2] px-3 py-1 text-xs font-semibold text-[#276342]">{roleLabel}</div>
              <div className="mt-4 grid gap-x-7 gap-y-2 text-sm text-[#496354] sm:grid-cols-2">
                <p className="break-all">{profile.email}</p>
                <p>{profile.phone || 'Chưa cập nhật số điện thoại'}</p>
                <p className="sm:col-span-2">{profile.address || 'Chưa cập nhật địa chỉ nhận hàng'}</p>
              </div>
            </div>
            <button type="button" onClick={openEditor} className="h-11 shrink-0 rounded-lg bg-[#1d4d38] px-5 text-sm font-semibold text-white transition hover:bg-[#173d30]">Chỉnh sửa thông tin</button>
          </div>
          <div className="absolute bottom-0 left-0 h-1 w-full bg-[#e2c76c]" />
        </section>

        {notice && <div role="status" className={`mt-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${addressUnavailable ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-[#c8ddca] bg-[#edf6ee] text-[#275d3d]'}`}>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo" className="text-lg leading-none">×</button>
        </div>}

        <div className="py-6 sm:py-7">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <section>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#66806e]">Không gian cá nhân</p>
                    <h2 className="mt-1 text-2xl font-semibold text-[#1d4d38]">Tổng quan tài khoản</h2>
                  </div>
                  {profile.createdAt && <p className="text-right text-xs text-[#758279]">Thành viên từ {formatDate(profile.createdAt)}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Đơn hàng', value: orders.length, detail: 'đơn đã đặt' },
                    { label: 'Workshop', value: registrations.length, detail: 'lịch đã đăng ký' },
                    { label: 'Thông tin', value: profile.phone && profile.address ? 'Đầy đủ' : 'Cần bổ sung', detail: 'hồ sơ cá nhân' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-[#e4dece] bg-white px-5 py-4">
                      <p className="text-sm text-[#6b7a70]">{item.label}</p>
                      <p className="mt-1 text-2xl font-semibold text-[#1d4d38]">{item.value}</p>
                      <p className="mt-1 text-xs text-[#7c887f]">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
                <div className="rounded-xl border border-[#e4dece] bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-[#1d4d38]">Thông tin cá nhân</h3>
                    <button type="button" onClick={openEditor} className="text-sm font-semibold text-[#26704e] hover:underline">Chỉnh sửa</button>
                  </div>
                  <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                    <div><dt className="text-[#7b877e]">Họ và tên</dt><dd className="mt-1 font-medium text-[#31483a]">{profile.fullName || 'Chưa cập nhật'}</dd></div>
                    <div><dt className="text-[#7b877e]">Email</dt><dd className="mt-1 break-all font-medium text-[#31483a]">{profile.email}</dd></div>
                    <div><dt className="text-[#7b877e]">Số điện thoại</dt><dd className="mt-1 font-medium text-[#31483a]">{profile.phone || 'Chưa cập nhật'}</dd></div>
                    <div><dt className="text-[#7b877e]">Địa chỉ nhận hàng</dt><dd className="mt-1 font-medium text-[#31483a]">{profile.address || 'Chưa cập nhật'}</dd></div>
                  </dl>
                </div>
                <div className="rounded-xl border border-[#e4dece] bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-[#1d4d38]">Gần đây</h3>
                    <button type="button" onClick={() => setActiveTab('orders')} className="text-sm font-semibold text-[#26704e] hover:underline">Xem tất cả</button>
                  </div>
                  {orders[0] ? (
                    <button type="button" onClick={() => setSelectedOrderId(orders[0].id)} className="mt-4 flex w-full items-center justify-between gap-4 border-t border-[#eee9de] pt-4 text-left">
                      <span><span className="block font-medium text-[#31483a]">Đơn {orders[0].code}</span><span className="mt-1 block text-xs text-[#7b877e]">{formatDate(orders[0].placed_at, true)}</span></span>
                      <span className="shrink-0 text-right"><span className="block text-sm font-semibold text-[#1d4d38]">{formatMoney(orders[0].total)}</span><span className="mt-1 block text-xs text-[#26704e]">Chi tiết →</span></span>
                    </button>
                  ) : <p className="mt-4 border-t border-[#eee9de] pt-4 text-sm text-[#748078]">Đơn hàng mới sẽ xuất hiện tại đây.</p>}
                  {registrations[0] && (
                    <button type="button" onClick={() => setSelectedRegistration(registrations[0])} className="mt-4 flex w-full items-center justify-between gap-4 border-t border-[#eee9de] pt-4 text-left">
                      <span><span className="block font-medium text-[#31483a]">Mã workshop {registrations[0].code}</span><span className="mt-1 block text-xs text-[#7b877e]">{formatDate(registrations[0].created_at, true)}</span></span>
                      <span className="text-sm font-semibold text-[#26704e]">Chi tiết →</span>
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'personal' && (
            <section className="max-w-4xl rounded-xl border border-[#e4dece] bg-white p-5 sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <ProfileAvatar profile={profile} size="small" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold text-[#1d4d38]">Thông tin cá nhân</h2>
                  <p className="mt-1 text-sm text-[#6e7c72]">Thông tin này được dùng để hỗ trợ đơn hàng và lịch trải nghiệm.</p>
                </div>
                <button type="button" onClick={openEditor} className="h-10 rounded-lg bg-[#1d4d38] px-4 text-sm font-semibold text-white hover:bg-[#173d30]">Chỉnh sửa thông tin</button>
              </div>
              <dl className="mt-6 grid gap-x-8 gap-y-5 border-t border-[#eee9de] pt-6 sm:grid-cols-2">
                <div><dt className="text-xs font-medium uppercase tracking-wide text-[#849087]">Họ và tên</dt><dd className="mt-1 break-words text-sm font-medium text-[#31483a]">{profile.fullName || 'Chưa cập nhật'}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-[#849087]">Email</dt><dd className="mt-1 break-all text-sm font-medium text-[#31483a]">{profile.email}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-[#849087]">Số điện thoại</dt><dd className="mt-1 text-sm font-medium text-[#31483a]">{profile.phone || 'Chưa cập nhật'}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-[#849087]">Địa chỉ nhận hàng</dt><dd className="mt-1 break-words text-sm font-medium text-[#31483a]">{profile.address || 'Chưa cập nhật'}</dd></div>
                <div><dt className="text-xs font-medium uppercase tracking-wide text-[#849087]">Ngày tham gia</dt><dd className="mt-1 text-sm font-medium text-[#31483a]">{profile.createdAt ? formatDate(profile.createdAt) : '—'}</dd></div>
              </dl>
              <div className="mt-7 border-t border-[#eee9de] pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="font-semibold text-[#31483a]">Bảo mật tài khoản</h3><p className="mt-1 text-sm text-[#6e7c72]">Mật khẩu được quản lý an toàn bởi Supabase Auth.</p></div>
                  <button type="button" onClick={() => { setPasswordError(''); setChangingPassword(true); }} className="h-10 rounded-lg border border-[#bdd3c3] px-4 text-sm font-semibold text-[#1d6043] hover:bg-[#edf5ee]">Đổi mật khẩu</button>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'orders' && renderOrders()}
          {activeTab === 'workshops' && renderWorkshops()}
        </div>
        </main>
      </div>

      {editing && (
        <Dialog title="Chỉnh sửa thông tin" onClose={() => setEditing(false)}>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="flex items-center gap-4">
              <ProfileAvatar profile={profile} size="small" />
              <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-[#bdd3c3] px-4 text-sm font-semibold text-[#1d6043] hover:bg-[#edf5ee]">
                {uploading ? 'Đang tải ảnh...' : 'Thay ảnh đại diện'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    void uploadAvatar(file);
                  }}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-[#40574a]">Họ và tên
              <input required minLength={2} maxLength={100} value={editValues.fullName} onChange={(event) => setEditValues({ ...editValues, fullName: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#d7d0b8] bg-white px-3 outline-none focus:border-[#1d4d38]" />
            </label>
            <label className="block text-sm font-medium text-[#40574a]">Email
              <input required type="email" maxLength={254} value={editValues.email} onChange={(event) => setEditValues({ ...editValues, email: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#d7d0b8] bg-white px-3 outline-none focus:border-[#1d4d38]" />
              <span className="mt-1 block text-xs font-normal text-[#7b877e]">Email mới chỉ có hiệu lực sau khi bạn xác nhận qua hộp thư.</span>
            </label>
            <label className="block text-sm font-medium text-[#40574a]">Số điện thoại liên hệ
              <input type="tel" maxLength={30} value={editValues.phone} onChange={(event) => setEditValues({ ...editValues, phone: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#d7d0b8] bg-white px-3 outline-none focus:border-[#1d4d38]" />
              <span className="mt-1 block text-xs font-normal text-[#7b877e]">Số điện thoại chưa được xác minh; vui lòng nhập chính xác để doanh nghiệp liên hệ giao hàng.</span>
            </label>
            <label className="block text-sm font-medium text-[#40574a]">Địa chỉ nhận hàng
              <textarea rows={3} maxLength={300} value={editValues.address} onChange={(event) => setEditValues({ ...editValues, address: event.target.value })} className="mt-1 w-full resize-y rounded-lg border border-[#d7d0b8] bg-white px-3 py-2 outline-none focus:border-[#1d4d38]" />
            </label>
            {formError && <p role="alert" className="rounded-lg bg-[#fcebea] px-3 py-2 text-sm text-[#9b3c32]">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-[#eee9de] pt-4">
              <button type="button" onClick={() => setEditing(false)} className="h-10 rounded-lg border border-[#d7d0b8] px-4 text-sm font-medium text-[#40574a]">Hủy</button>
              <button type="submit" disabled={saving || uploading} className="h-10 rounded-lg bg-[#1d4d38] px-5 text-sm font-semibold text-white hover:bg-[#173d30] disabled:opacity-60">{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
            </div>
          </form>
        </Dialog>
      )}

      {changingPassword && (
        <Dialog title="Đổi mật khẩu" onClose={() => setChangingPassword(false)}>
          <form onSubmit={savePassword} className="space-y-4">
            <label className="block text-sm font-medium text-[#40574a]">Mật khẩu hiện tại
              <input required type="password" autoComplete="current-password" value={passwordValues.currentPassword} onChange={(event) => setPasswordValues({ ...passwordValues, currentPassword: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#d7d0b8] bg-white px-3 outline-none focus:border-[#1d4d38]" />
            </label>
            <label className="block text-sm font-medium text-[#40574a]">Mật khẩu mới
              <input required minLength={8} maxLength={72} type="password" autoComplete="new-password" value={passwordValues.newPassword} onChange={(event) => setPasswordValues({ ...passwordValues, newPassword: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#d7d0b8] bg-white px-3 outline-none focus:border-[#1d4d38]" />
            </label>
            <label className="block text-sm font-medium text-[#40574a]">Xác nhận mật khẩu mới
              <input required minLength={8} maxLength={72} type="password" autoComplete="new-password" value={passwordValues.confirmPassword} onChange={(event) => setPasswordValues({ ...passwordValues, confirmPassword: event.target.value })} className="mt-1 h-11 w-full rounded-lg border border-[#d7d0b8] bg-white px-3 outline-none focus:border-[#1d4d38]" />
            </label>
            {passwordError && <p role="alert" className="rounded-lg bg-[#fcebea] px-3 py-2 text-sm text-[#9b3c32]">{passwordError}</p>}
            <div className="flex justify-end gap-2 border-t border-[#eee9de] pt-4">
              <button type="button" onClick={() => setChangingPassword(false)} className="h-10 rounded-lg border border-[#d7d0b8] px-4 text-sm font-medium text-[#40574a]">Hủy</button>
              <button type="submit" disabled={changing} className="h-10 rounded-lg bg-[#1d4d38] px-5 text-sm font-semibold text-white hover:bg-[#173d30] disabled:opacity-60">{changing ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}</button>
            </div>
          </form>
        </Dialog>
      )}

      {selectedOrder && (
        <Dialog title={`Chi tiết đơn ${selectedOrder.code}`} wide onClose={() => setSelectedOrderId(null)}>
          <div className="space-y-5">
            <div className="grid gap-4 rounded-lg bg-[#f7f4ec] p-4 text-sm sm:grid-cols-3">
              <p><span className="block text-xs text-[#7b877e]">Ngày đặt</span><span className="mt-1 block font-medium text-[#31483a]">{formatDate(selectedOrder.placed_at, true)}</span></p>
              <p><span className="block text-xs text-[#7b877e]">Trạng thái</span><span className="mt-1 block"><StatusBadge status={selectedOrder.status} label={orderLabels[selectedOrder.status] ?? selectedOrder.status} /></span></p>
              <p><span className="block text-xs text-[#7b877e]">Tổng tiền</span><span className="mt-1 block font-semibold text-[#1d4d38]">{formatMoney(selectedOrder.total)}</span></p>
            </div>
            {(selectedOrder.orders_child ?? []).map((child) => (
              <section key={child.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="font-semibold text-[#31483a]">{relationOne(child.partner_profiles)?.business_name ?? 'Cơ sở OCOP'}</h3><p className="text-xs text-[#7b877e]">Mã giao hàng {child.code}</p></div>
                  <StatusBadge status={child.status} label={orderLabels[child.status] ?? child.status} />
                </div>
                {child.order_items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 border-t border-[#eee9de] pt-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#f1eee5]">{item.product_image && <img src={item.product_image} alt={item.product_name} className="h-full w-full object-cover" />}</div>
                    <div className="min-w-0 flex-1"><p className="font-medium text-[#31483a]">{item.product_name}</p><p className="mt-1 text-xs text-[#7b877e]">Số lượng: {item.qty} · {formatMoney(item.unit_price)}/sản phẩm</p></div>
                    <p className="shrink-0 text-sm font-semibold text-[#1d4d38]">{formatMoney(item.line_total)}</p>
                    {['DELIVERED', 'COMPLETED'].includes(child.status) && relationOne(item.products)?.slug && (
                      <Link href={`/products/${relationOne(item.products)?.slug}#reviews`} className="shrink-0 rounded-lg bg-[#1d4d38] px-3 py-2 text-xs font-semibold text-white hover:bg-[#173d30]">
                        Đánh giá
                      </Link>
                    )}
                  </div>
                ))}
                {child.order_status_history.length > 0 && (
                  <div className="border-t border-[#eee9de] pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#758279]">Cập nhật giao hàng</p>
                    <ol className="mt-2 space-y-2">
                      {child.order_status_history.map((event, index) => <li key={`${event.to_status}-${event.created_at}-${index}`} className="flex justify-between gap-3 text-xs text-[#55685b]"><span>{orderLabels[event.to_status] ?? event.to_status}{event.reason ? ` · ${event.reason}` : ''}</span><time className="shrink-0">{formatDate(event.created_at, true)}</time></li>)}
                    </ol>
                  </div>
                )}
                <CustomerOrderActions
                  key={`${child.id}:${child.status}:${child.order_service_requests.map((request) => `${request.id}-${request.status}-${request.refund_status}`).join(',')}`}
                  orderId={child.id}
                  status={child.status}
                  phone={typeof selectedOrder.shipping_address.phone === 'string' ? selectedOrder.shipping_address.phone : ''}
                  requests={child.order_service_requests}
                />
              </section>
            ))}
          </div>
        </Dialog>
      )}

      {selectedRegistration && (() => {
        const session = relationOne(selectedRegistration.workshop_sessions);
        const workshop = relationOne(session?.workshops);
        const partner = relationOne(workshop?.partner_profiles);
        return (
          <Dialog title="Chi tiết đăng ký Workshop" onClose={() => setSelectedRegistration(null)}>
            <div className="space-y-4">
              {workshop?.cover_image && <div className="aspect-[16/7] overflow-hidden rounded-lg bg-[#f1eee5]"><img src={workshop.cover_image} alt={workshop.title} className="h-full w-full object-cover" /></div>}
              <h3 className="text-lg font-semibold text-[#1d4d38]">{workshop?.title ?? 'Workshop OCOP'}</h3>
              <dl className="grid gap-4 border-t border-[#eee9de] pt-4 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-[#7b877e]">Đơn vị tổ chức</dt><dd className="mt-1 font-medium text-[#31483a]">{partner?.business_name ?? 'Đơn vị OCOP'}</dd></div>
                <div><dt className="text-xs text-[#7b877e]">Mã đăng ký</dt><dd className="mt-1 font-medium text-[#31483a]">{selectedRegistration.code}</dd></div>
                <div><dt className="text-xs text-[#7b877e]">Thời gian</dt><dd className="mt-1 font-medium text-[#31483a]">{session ? `${formatDate(session.starts_at, true)} – ${new Intl.DateTimeFormat('vi-VN', { timeStyle: 'short' }).format(new Date(session.ends_at))}` : 'Chưa cập nhật'}</dd></div>
                <div><dt className="text-xs text-[#7b877e]">Địa điểm</dt><dd className="mt-1 font-medium text-[#31483a]">{session?.location ?? 'Chưa cập nhật'}</dd></div>
                <div><dt className="text-xs text-[#7b877e]">Số người</dt><dd className="mt-1 font-medium text-[#31483a]">1 người</dd></div>
                <div><dt className="text-xs text-[#7b877e]">Trạng thái</dt><dd className="mt-1"><StatusBadge status={selectedRegistration.status} label={registrationLabels[selectedRegistration.status] ?? selectedRegistration.status} /></dd></div>
              </dl>
              <p className="border-t border-[#eee9de] pt-4 text-sm font-semibold text-[#1d4d38]">Phí đăng ký: {formatMoney(selectedRegistration.amount)}</p>
              {selectedRegistration.status === 'COMPLETED' && workshop?.slug && (
                <Link href={`/workshops/${workshop.slug}#reviews`} className="inline-flex rounded-lg bg-[#1d4d38] px-4 py-2 text-sm font-semibold text-white hover:bg-[#173d30]">
                  Đánh giá trải nghiệm
                </Link>
              )}
            </div>
          </Dialog>
        );
      })()}
    </div>
  );
}