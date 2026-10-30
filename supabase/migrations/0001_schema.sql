
-- OCOP Hub — 0001_schema.sql
-- Enums
create type user_role as enum ('CUSTOMER', 'PARTNER', 'ADMIN');
create type user_status as enum ('ACTIVE', 'BLOCKED');
create type selling_status as enum ('NONE', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
create type application_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type product_status as enum ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'UNLISTED');
create type supply_status as enum ('IN_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER');
create type workshop_status as enum ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
create type session_status as enum ('SCHEDULED', 'OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED');
create type registration_status as enum (
  'PENDING', 'PAYMENT_PROCESSING', 'CONFIRMED',
  'CANCELLED_PAYMENT_FAILED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_PARTNER',
  'REFUNDED', 'COMPLETED'
);
create type order_level as enum ('PARENT', 'CHILD');
create type order_status as enum (
  'CREATED', 'PAYMENT_PENDING', 'PAID',
  'PENDING_ACCEPTANCE', 'ACCEPTED', 'PROCESSING', 'SHIPPED', 'DELIVERED',
  'COMPLETED', 'REJECTED_BY_PARTNER', 'CANCELLED', 'EXPIRED', 'PARTIALLY_REFUNDED'
);
create type payment_purpose as enum ('ORDER', 'WORKSHOP_REGISTRATION');
create type payment_status as enum (
  'CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED',
  'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'
);
create type sync_status as enum ('PENDING_SYNC', 'SYNCED');
create type refund_status as enum ('REQUESTED', 'PROCESSING', 'COMPLETED', 'FAILED');
create type txn_type as enum ('PAYMENT', 'REFUND');
create type settlement_status as enum ('DRAFT', 'CONFIRMED', 'PAID');
create type availability_change as enum ('DECLARED', 'RESERVE', 'RELEASE', 'COMMIT');

-- ============ Accounts ============
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  phone text,
  full_name text,
  avatar_url text,
  status user_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role user_role not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.partner_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  business_name text not null,
  business_license_no text not null unique,
  address text,
  contact_email text,
  contact_phone text,
  bank_name text,
  bank_account_no text,
  selling_status selling_status not null default 'NONE',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_profiles(user_id) on delete cascade,
  submitted_docs jsonb not null default '{}'::jsonb,
  note text,
  status application_status not null default 'PENDING',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index idx_partner_applications_partner on public.partner_applications(partner_id, status);

-- ============ Products ============
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  price numeric(12,2) not null check (price > 0),
  status product_status not null default 'DRAFT',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  reject_reason text,
  ocop_cert_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_partner on public.products(partner_id, status);
create index idx_products_public on public.products(status, category_id);
create index idx_products_search on public.products using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(short_description, '') || ' ' || coalesce(description, '')));

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order int not null default 0
);
create index idx_product_images_product on public.product_images(product_id);

-- Declared available quantity — KHÔNG phải kho vật lý
create table public.product_availability (
  product_id uuid primary key references public.products(id) on delete cascade,
  available_qty int not null default 0 check (available_qty >= 0),
  reserved_qty int not null default 0 check (reserved_qty >= 0),
  supply_status supply_status not null default 'IN_STOCK',
  pre_order_eta date,
  version int not null default 0,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  constraint ck_available_ge_reserved check (available_qty >= reserved_qty)
);

create table public.product_availability_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  change_type availability_change not null,
  qty_before int not null,
  qty_after int not null,
  ref_type text,
  ref_id uuid,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index idx_av_history_product on public.product_availability_history(product_id, created_at);

-- ============ Workshops ============
create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  title text not null,
  slug text not null unique,
  description text,
  cover_image text,
  status workshop_status not null default 'DRAFT',
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_workshops_partner on public.workshops(partner_id, status);
create index idx_workshops_public on public.workshops(status);

create table public.workshop_sessions (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null,
  fee numeric(12,2) not null default 0 check (fee >= 0),
  capacity int not null check (capacity > 0),
  remaining_seats int not null check (remaining_seats >= 0),
  status session_status not null default 'SCHEDULED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_session_times check (ends_at > starts_at),
  constraint ck_seats_le_capacity check (remaining_seats <= capacity)
);
create index idx_sessions_workshop on public.workshop_sessions(workshop_id);
create index idx_sessions_open on public.workshop_sessions(status, starts_at);

create table public.workshop_registrations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  session_id uuid not null references public.workshop_sessions(id) on delete restrict,
  customer_id uuid not null references public.users(id) on delete restrict,
  status registration_status not null default 'PENDING',
  amount numeric(12,2) not null check (amount >= 0),
  hold_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FIX: Bổ sung từ khóa INDEX
create unique index uq_registration_active
on public.workshop_registrations(session_id, customer_id)
where status in ('PENDING', 'PAYMENT_PROCESSING', 'CONFIRMED');

create index idx_registrations_customer on public.workshop_registrations(customer_id);
create index idx_registrations_session on public.workshop_registrations(session_id, status);

-- ============ Cart & Orders ============
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty int not null check (qty > 0),
  unique (cart_id, product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references public.users(id) on delete restrict,
  order_level order_level not null,
  parent_order_id uuid references public.orders(id) on delete restrict,
  partner_id uuid references public.partner_profiles(user_id) on delete restrict,
  subtotal numeric(12,2) not null default 0,
  shipping_fee numeric(12,2) not null default 0,
  platform_fee numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  shipping_address jsonb not null default '{}'::jsonb,
  status order_status not null default 'CREATED',
  idempotency_key text,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_parent check (
    (order_level = 'PARENT' and parent_order_id is null and partner_id is null)
    or (order_level = 'CHILD' and parent_order_id is not null and partner_id is not null)
  )
);

-- FIX: Bổ sung từ khóa INDEX
create unique index uq_order_idem
on public.orders(customer_id, idempotency_key)
where idempotency_key is not null;

create index idx_orders_parent on public.orders(parent_order_id);
create index idx_orders_partner on public.orders(partner_id, status);
create index idx_orders_customer on public.orders(customer_id, placed_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  product_name text not null,
  product_image text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  qty int not null check (qty > 0),
  line_total numeric(12,2) not null
);
create index idx_order_items_order on public.order_items(order_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor_id uuid,
  actor_role text,
  reason text,
  created_at timestamptz not null default now()
);
create index idx_order_history_order on public.order_status_history(order_id, created_at);

-- ============ Payments ============
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  purpose payment_purpose not null,
  reference_id uuid not null,
  customer_id uuid not null references public.users(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'VND',
  status payment_status not null default 'CREATED',
  refunded_amount numeric(12,2) not null default 0,
  provider text not null default 'mock',
  expires_at timestamptz,
  business_sync_status sync_status not null default 'PENDING_SYNC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_refunded_le_amount check (refunded_amount <= amount)
);
create index idx_payments_reference on public.payments(purpose, reference_id);
create index idx_payments_customer on public.payments(customer_id);
create index idx_payments_pending on public.payments(status, expires_at) where status in ('CREATED', 'PENDING');

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  type txn_type not null,
  provider text not null,
  provider_txn_id text not null,
  amount numeric(12,2) not null,
  status text not null,
  request jsonb,
  response jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_txn_id, type)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  event_id text not null unique,
  signature_valid boolean not null default false,
  raw jsonb not null,
  processed boolean not null default false,
  received_at timestamptz not null default now()
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  ref_type text not null,
  ref_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  status refund_status not null default 'REQUESTED',
  provider_refund_id text unique,
  requested_by uuid references public.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_refunds_payment on public.refunds(payment_id);

-- ============ Settlements ============
create table public.settlement_statements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  period_start date not null,
  period_end date not null,
  gross_amount numeric(14,2) not null default 0,
  refund_amount numeric(14,2) not null default 0,
  platform_fee numeric(14,2) not null default 0,
  adjustments numeric(14,2) not null default 0,
  net_payable numeric(14,2) not null default 0,
  status settlement_status not null default 'DRAFT',
  generated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (partner_id, period_start, period_end)
);

create table public.settlement_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.settlement_statements(id) on delete cascade,
  ref_type text not null,
  ref_id uuid not null,
  amount numeric(14,2) not null,
  direction text not null check (direction in ('CREDIT', 'DEBIT')),
  created_at timestamptz not null default now(),
  unique (statement_id, ref_type, ref_id)
);
create index idx_settlement_items_statement on public.settlement_items(statement_id);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.settlement_statements(id) on delete restrict,
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'BANK_TRANSFER',
  ref_no text not null unique,
  transferred_at timestamptz not null,
  recorded_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.adjustments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  amount numeric(14,2) not null,
  reason text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

-- ============ System ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  ref_type text,
  ref_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on public.notifications(user_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_created on public.audit_logs(created_at desc);

create table public.fee_config (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'GLOBAL' check (scope in ('GLOBAL', 'PARTNER')),
  partner_id uuid references public.partner_profiles(user_id) on delete cascade,
  type text not null check (type in ('SHIPPING', 'PLATFORM_RATE')),
  rules jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  effective_to timestamptz
);
create index idx_fee_config_lookup on public.fee_config(scope, partner_id, type);

-- ============ Trigger: auto profile khi đăng ký auth ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''));

  -- role do client set qua metadata 'role' (chỉ CUSTOMER hoặc PARTNER — không bao giờ ADMIN)
  if coalesce(new.raw_user_meta_data->>'role', 'CUSTOMER') = 'PARTNER' then
    insert into public.user_roles (user_id, role) values (new.id, 'PARTNER');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'CUSTOMER');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
