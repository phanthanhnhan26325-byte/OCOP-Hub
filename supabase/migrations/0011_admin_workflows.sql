create or replace function public.admin_review_partner_application(
  p_admin uuid,
  p_application uuid,
  p_decision application_status,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.partner_applications%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision = 'REJECTED' and length(coalesce(v_reason, '')) < 3 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_application
  from public.partner_applications
  where id = p_application
  for update;
  if not found or v_application.status <> 'PENDING' then
    raise exception 'INVALID_STATE: application is not pending';
  end if;

  update public.partner_applications
  set status = p_decision,
      reviewed_by = p_admin,
      reviewed_at = now(),
      reject_reason = case when p_decision = 'REJECTED' then v_reason else null end
  where id = p_application;

  update public.partner_profiles
  set selling_status = case when p_decision = 'APPROVED' then 'APPROVED'::selling_status else 'REJECTED'::selling_status end,
      reviewed_by = p_admin,
      reviewed_at = now(),
      reject_reason = case when p_decision = 'REJECTED' then v_reason else null end,
      updated_at = now()
  where user_id = v_application.partner_id;
  if not found then
    raise exception 'NOT_FOUND: partner profile';
  end if;

  insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
  values (
    v_application.partner_id,
    'partner_application_' || lower(p_decision::text),
    case when p_decision = 'APPROVED' then 'Hồ sơ doanh nghiệp đã được phê duyệt' else 'Hồ sơ doanh nghiệp chưa được phê duyệt' end,
    case when p_decision = 'APPROVED' then 'Hồ sơ đăng ký bán hàng của bạn đã được phê duyệt.'
      else 'Hồ sơ đăng ký bán hàng của bạn bị từ chối. Lý do: ' || v_reason end,
    'partner_application',
    p_application
  );

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin,
    'ADMIN',
    'PARTNER_APPLICATION_REVIEW',
    'partner_application',
    p_application::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason, 'partner_id', v_application.partner_id)
  );

  return jsonb_build_object('ok', true, 'partner_id', v_application.partner_id, 'decision', p_decision);
end;
$$;

create or replace function public.admin_review_product(
  p_admin uuid,
  p_product uuid,
  p_decision product_status,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'VALIDATION: invalid product decision';
  end if;
  if p_decision = 'REJECTED' and length(coalesce(v_reason, '')) < 3 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_product
  from public.products
  where id = p_product
  for update;
  if not found or v_product.status <> 'PENDING' then
    raise exception 'INVALID_STATE: product is not pending';
  end if;

  update public.products
  set status = p_decision,
      reviewed_by = p_admin,
      reviewed_at = now(),
      reject_reason = case when p_decision = 'REJECTED' then v_reason else null end,
      updated_at = now()
  where id = p_product;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'PRODUCT_REVIEW', 'product', p_product::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason)
  );
  return jsonb_build_object('ok', true, 'product_id', p_product, 'decision', p_decision);
end;
$$;

create or replace function public.admin_review_workshop(
  p_admin uuid,
  p_workshop uuid,
  p_decision workshop_status,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop public.workshops%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'VALIDATION: invalid workshop decision';
  end if;
  if p_decision = 'REJECTED' and length(coalesce(v_reason, '')) < 3 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_workshop
  from public.workshops
  where id = p_workshop
  for update;
  if not found or v_workshop.status <> 'PENDING' then
    raise exception 'INVALID_STATE: workshop is not pending';
  end if;

  update public.workshops
  set status = p_decision,
      reviewed_by = p_admin,
      reviewed_at = now(),
      reject_reason = case when p_decision = 'REJECTED' then v_reason else null end,
      updated_at = now()
  where id = p_workshop;

  if p_decision = 'APPROVED' then
    update public.workshop_sessions
    set status = 'OPEN', updated_at = now()
    where workshop_id = p_workshop
      and status = 'SCHEDULED'
      and starts_at > now();
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'WORKSHOP_REVIEW', 'workshop', p_workshop::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason)
  );
  return jsonb_build_object('ok', true, 'workshop_id', p_workshop, 'decision', p_decision);
end;
$$;

create or replace function public.admin_record_payout(
  p_admin uuid,
  p_statement uuid,
  p_amount numeric,
  p_ref_no text,
  p_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statement public.settlement_statements%rowtype;
  v_paid numeric;
  v_payout uuid;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount)
     or length(trim(coalesce(p_ref_no, ''))) < 3 then
    raise exception 'VALIDATION: invalid payout';
  end if;

  select * into v_statement
  from public.settlement_statements
  where id = p_statement
  for update;
  if not found then
    raise exception 'NOT_FOUND: settlement';
  end if;
  if v_statement.status not in ('CONFIRMED', 'PAID') then
    raise exception 'INVALID_STATE: settlement must be confirmed before payout';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payouts
  where statement_id = p_statement;
  if p_amount > v_statement.net_payable - v_paid then
    raise exception 'AMOUNT_EXCEEDS';
  end if;

  insert into public.payouts (statement_id, partner_id, amount, method, ref_no, transferred_at, recorded_by)
  values (p_statement, v_statement.partner_id, p_amount, coalesce(nullif(trim(p_method), ''), 'BANK_TRANSFER'), trim(p_ref_no), now(), p_admin)
  returning id into v_payout;

  select coalesce(sum(amount), 0) into v_paid
  from public.payouts
  where statement_id = p_statement;
  if v_paid >= v_statement.net_payable then
    update public.settlement_statements set status = 'PAID' where id = p_statement;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'PAYOUT_RECORDED', 'settlement', p_statement::text,
    jsonb_build_object('payout_id', v_payout, 'amount', p_amount, 'ref_no', p_ref_no)
  );
  return jsonb_build_object('ok', true, 'payout_id', v_payout, 'paid_total', v_paid);
end;
$$;

create or replace function public.admin_confirm_settlement(
  p_admin uuid,
  p_statement uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statement public.settlement_statements%rowtype;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_statement
  from public.settlement_statements
  where id = p_statement
  for update;
  if not found then
    raise exception 'NOT_FOUND: settlement';
  end if;
  if v_statement.status <> 'DRAFT' then
    raise exception 'INVALID_STATE: settlement is not a draft';
  end if;

  update public.settlement_statements
  set status = 'CONFIRMED', confirmed_at = now()
  where id = p_statement;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'SETTLEMENT_CONFIRMED', 'settlement', p_statement::text,
    jsonb_build_object('status', 'CONFIRMED', 'net_payable', v_statement.net_payable)
  );
  return jsonb_build_object('ok', true, 'statement_id', p_statement);
end;
$$;

create or replace function public.admin_dashboard_overview(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'customers', (select count(*) from public.user_roles where role = 'CUSTOMER'),
    'partners', (select count(*) from public.partner_profiles),
    'pendingPartners', (select count(*) from public.partner_applications where status = 'PENDING'),
    'products', (select count(*) from public.products),
    'activeProducts', (select count(*) from public.products where status = 'APPROVED'),
    'workshops', (select count(*) from public.workshops),
    'upcomingWorkshops', (
      select count(distinct w.id)
      from public.workshops w
      join public.workshop_sessions s on s.workshop_id = w.id
      where w.status = 'APPROVED' and s.status = 'OPEN' and s.starts_at > now()
    ),
    'orders', (select count(*) from public.orders where order_level = 'PARENT'),
    'processingOrders', (
      select count(*) from public.orders
      where order_level = 'CHILD'
        and status in ('PENDING_ACCEPTANCE', 'ACCEPTED', 'PROCESSING', 'SHIPPED')
    ),
    'pendingPayments', (
      select count(*) from public.payments
      where status in ('CREATED', 'PENDING')
    ),
    'confirmedRevenue', (
      select coalesce(sum(amount), 0)
      from public.payments
      where status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        and business_sync_status = 'SYNCED'
    ),
    'refundedAmount', (
      select coalesce(sum(refunded_amount), 0)
      from public.payments
      where business_sync_status = 'SYNCED'
    ),
    'payoutDue', (
      select coalesce(sum(greatest(s.net_payable - coalesce(p.paid, 0), 0)), 0)
      from public.settlement_statements s
      left join (
        select statement_id, sum(amount) as paid
        from public.payouts
        group by statement_id
      ) p on p.statement_id = s.id
      where s.status in ('CONFIRMED', 'PAID')
    )
  );
end;
$$;

revoke all on function public.admin_review_partner_application(uuid, uuid, application_status, text) from public, anon, authenticated;
revoke all on function public.admin_review_product(uuid, uuid, product_status, text) from public, anon, authenticated;
revoke all on function public.admin_review_workshop(uuid, uuid, workshop_status, text) from public, anon, authenticated;
revoke all on function public.admin_record_payout(uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.admin_confirm_settlement(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_dashboard_overview(uuid) from public, anon, authenticated;
grant execute on function public.admin_review_partner_application(uuid, uuid, application_status, text) to service_role;
grant execute on function public.admin_review_product(uuid, uuid, product_status, text) to service_role;
grant execute on function public.admin_review_workshop(uuid, uuid, workshop_status, text) to service_role;
grant execute on function public.admin_record_payout(uuid, uuid, numeric, text, text) to service_role;
grant execute on function public.admin_confirm_settlement(uuid, uuid) to service_role;
grant execute on function public.admin_dashboard_overview(uuid) to service_role;
