-- OCOP Hub — 0002_rls.sql
-- Defense-in-depth: RLS cho mọi bảng ứng dụng.
-- Client dùng anon/authenticated key; server dùng service-role bypass RLS.

alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.partner_profiles enable row level security;
alter table public.partner_applications enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_availability enable row level security;
alter table public.product_availability_history enable row level security;
alter table public.workshops enable row level security;
alter table public.workshop_sessions enable row level security;
alter table public.workshop_registrations enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.settlement_statements enable row level security;
alter table public.settlement_items enable row level security;
alter table public.payouts enable row level security;
alter table public.adjustments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.fee_config enable row level security;

-- Helper: role hiện tại của auth user
create or replace function public.current_role_of(uid uuid)
returns setof user_role
language sql stable security definer set search_path = public
as $$ select role from public.user_roles where user_id = uid $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.user_roles where user_id = auth.uid() and role = 'ADMIN') $$;

create or replace function public.is_partner_approved()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.partner_profiles
    where user_id = auth.uid() and selling_status = 'APPROVED'
  )
$$;

-- Users: tự xem/sửa hồ sơ mình; admin toàn quyền
create policy users_select_self on public.users for select
  using (id = auth.uid() or public.is_admin());
create policy users_update_self on public.users for update
  using (id = auth.uid() or public.is_admin()) with check (true);

create policy roles_select_self on public.user_roles for select
  using (user_id = auth.uid() or public.is_admin());

-- Partner profiles: chủ partner + admin; công khai business_name cho APPROVED
create policy partner_profiles_select on public.partner_profiles for select
  using (
    user_id = auth.uid() or public.is_admin()
    or selling_status = 'APPROVED'
  );
create policy partner_profiles_insert on public.partner_profiles for insert
  with check (user_id = auth.uid());
create policy partner_profiles_update on public.partner_profiles for update
  using (user_id = auth.uid() or public.is_admin()) with check (true);

create policy partner_apps_select on public.partner_applications for select
  using (partner_id = auth.uid() or public.is_admin());
create policy partner_apps_insert on public.partner_applications for insert
  with check (partner_id = auth.uid());

-- Categories: công khai đọc
create policy categories_select on public.product_categories for select using (true);

-- Products: công khai APPROVED; partner thấy/sp自己的; admin toàn quyền
create policy products_select on public.products for select
  using (
    status = 'APPROVED'
    or partner_id = auth.uid()
    or public.is_admin()
  );

-- Availability: công khai đọc; partner sửa của mình; admin toàn quyền
create policy availability_select on public.product_availability for select
  using (true);
create policy availability_update on public.product_availability for update
  using ((exists (select 1 from public.products p where p.id = product_id and p.partner_id = auth.uid()) and public.is_partner_approved()) or public.is_admin())
  with check (true);

-- Workshops & sessions: công khai APPROVED
create policy workshops_select on public.workshops for select
  using (status = 'APPROVED' or partner_id = auth.uid() or public.is_admin());
create policy sessions_select on public.workshop_sessions for select
  using (
    exists (select 1 from public.workshops w where w.id = workshop_id
      and (w.status = 'APPROVED' or w.partner_id = auth.uid() or public.is_admin()))
  );

-- Registrations: chỉ chủ / partner sở hữu buổi / admin
create policy registrations_select on public.workshop_registrations for select
  using (
    customer_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.workshop_sessions s
      join public.workshops w on w.id = s.workshop_id
      where s.id = session_id and w.partner_id = auth.uid()
    )
  );

-- Carts: chủ sở hữu
create policy carts_select on public.carts for select using (customer_id = auth.uid());
create policy carts_insert on public.carts for insert with check (customer_id = auth.uid());
create policy carts_update on public.carts for update using (customer_id = auth.uid()) with check (true);
create policy cart_items_select on public.cart_items for select
  using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid()));
create policy cart_items_insert on public.cart_items for insert
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid()));
create policy cart_items_update on public.cart_items for update
  using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid())) with check (true);
create policy cart_items_delete on public.cart_items for delete
  using (exists (select 1 from public.carts c where c.id = cart_id and c.customer_id = auth.uid()));

-- Orders: khách xem đơn mình; partner xem child đơn của mình; admin toàn quyền
create policy orders_select on public.orders for select
  using (
    customer_id = auth.uid()
    or (order_level = 'CHILD' and partner_id = auth.uid())
    or public.is_admin()
  );
create policy order_items_select on public.order_items for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or partner_id = auth.uid()
    or public.is_admin()
  );
create policy order_history_select on public.order_status_history for select
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
    or public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.partner_id = auth.uid())
  );

-- Payments: chủ payment / admin
create policy payments_select on public.payments for select
  using (customer_id = auth.uid() or public.is_admin());
create policy payment_txns_select on public.payment_transactions for select
  using (exists (select 1 from public.payments p where p.id = payment_id and (p.customer_id = auth.uid() or public.is_admin())));

-- Refunds: admin (ghi) + partner/customer xem theo payment
create policy refunds_select on public.refunds for select
  using (
    public.is_admin()
    or exists (select 1 from public.payments p where p.id = payment_id and p.customer_id = auth.uid())
  );

-- Settlements: partner thấy statement của mình (read-only); admin toàn quyền
create policy settlements_select on public.settlement_statements for select
  using (partner_id = auth.uid() or public.is_admin());
create policy settlement_items_select on public.settlement_items for select
  using (
    public.is_admin()
    or exists (select 1 from public.settlement_statements s where s.id = statement_id and s.partner_id = auth.uid())
  );
create policy payouts_select on public.payouts for select
  using (partner_id = auth.uid() or public.is_admin());

-- Notifications / Audit
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (true);
create policy audit_select on public.audit_logs for select using (public.is_admin());

-- Fee config: admin ghi, mọi người đọc (để hiển thị phí)
create policy fee_select on public.fee_config for select using (true);
