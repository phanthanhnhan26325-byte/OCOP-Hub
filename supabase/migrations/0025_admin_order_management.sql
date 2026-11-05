create table public.order_shipments (
  order_id uuid primary key references public.orders(id) on delete cascade,
  carrier_name text not null,
  tracking_number text not null,
  handed_over_at timestamptz,
  delivered_at timestamptz,
  updated_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_order_shipment_carrier check (length(trim(carrier_name)) between 2 and 200),
  constraint ck_order_shipment_tracking check (length(trim(tracking_number)) between 2 and 200),
  constraint ck_order_shipment_delivery_time check (
    delivered_at is null or handed_over_at is null or delivered_at >= handed_over_at
  )
);

alter table public.order_shipments enable row level security;
create policy order_shipments_admin_select on public.order_shipments
  for select using (public.is_admin());

create table public.order_admin_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  request_type text not null check (request_type in ('CANCELLATION', 'RETURN')),
  status text not null check (status in ('COMPLETED')),
  reason text not null,
  received_via text,
  requested_by uuid not null references public.users(id),
  refund_id uuid references public.refunds(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ck_order_admin_request_reason check (length(trim(reason)) between 3 and 1000)
);

create index idx_order_admin_requests_order on public.order_admin_requests(order_id, created_at desc);
alter table public.order_admin_requests enable row level security;
create policy order_admin_requests_admin_select on public.order_admin_requests
  for select using (public.is_admin());

create or replace function public.admin_order_rows(p_admin uuid)
returns table (
  id uuid,
  code text,
  status text,
  customer_name text,
  customer_email text,
  customer_phone text,
  shipping_address jsonb,
  placed_at timestamptz,
  quantity bigint,
  subtotal numeric,
  discount numeric,
  shipping_fee numeric,
  total numeric,
  child_count bigint,
  payment_id uuid,
  payment_status text,
  payment_amount numeric,
  payment_provider text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    o.id,
    o.code,
    case
      when coalesce(children.child_count, 0) = 0 then o.status::text
      when children.cancelled_count = children.child_count then 'CANCELLED'
      when children.completed_count = children.child_count then 'COMPLETED'
      when children.delivered_count + children.completed_count = children.child_count then 'DELIVERED'
      when children.shipped_count > 0 then 'SHIPPED'
      when children.processing_count > 0 then 'PROCESSING'
      when children.accepted_count > 0 then 'ACCEPTED'
      when children.pending_acceptance_count > 0 then 'PENDING_ACCEPTANCE'
      else o.status::text
    end,
    coalesce(nullif(u.full_name, ''), u.email),
    u.email,
    u.phone,
    o.shipping_address,
    o.placed_at,
    coalesce(items.quantity, 0),
    o.subtotal,
    o.discount,
    o.shipping_fee,
    o.total,
    coalesce(children.child_count, 0),
    payment.id,
    payment.status::text,
    payment.amount,
    payment.provider
  from public.orders o
  join public.users u on u.id = o.customer_id
  left join lateral (
    select
      count(*) as child_count,
      count(*) filter (where c.status in ('CANCELLED', 'REJECTED_BY_PARTNER')) as cancelled_count,
      count(*) filter (where c.status = 'COMPLETED') as completed_count,
      count(*) filter (where c.status = 'DELIVERED') as delivered_count,
      count(*) filter (where c.status = 'SHIPPED') as shipped_count,
      count(*) filter (where c.status = 'PROCESSING') as processing_count,
      count(*) filter (where c.status = 'ACCEPTED') as accepted_count,
      count(*) filter (where c.status = 'PENDING_ACCEPTANCE') as pending_acceptance_count
    from public.orders c
    where c.parent_order_id = o.id
  ) children on true
  left join lateral (
    select coalesce(sum(oi.qty), 0) as quantity
    from public.orders c
    join public.order_items oi on oi.order_id = c.id
    where c.parent_order_id = o.id
  ) items on true
  left join lateral (
    select p.id, p.status, p.amount, p.provider
    from public.payments p
    where p.purpose = 'ORDER' and p.reference_id = o.id
    order by p.created_at desc
    limit 1
  ) payment on true
  where o.order_level = 'PARENT';
end;
$$;

create or replace function public.admin_order_dashboard_metrics(p_admin uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status in (
      'CREATED', 'PAYMENT_PENDING', 'PAID', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'PROCESSING'
    )),
    'shipping', count(*) filter (where status = 'SHIPPED'),
    'completed', count(*) filter (where status = 'COMPLETED')
  )
  into v_result
  from public.admin_order_rows(p_admin);

  return v_result;
end;
$$;

create or replace function public.admin_list_orders(
  p_admin uuid,
  p_search text default null,
  p_order_status text default null,
  p_payment_status text default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'newest',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_total bigint;
  v_orders jsonb;
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  with filtered as (
    select *
    from public.admin_order_rows(p_admin) r
    where (
      v_search is null
      or r.code ilike '%' || v_search || '%'
      or r.customer_name ilike '%' || v_search || '%'
      or r.customer_email ilike '%' || v_search || '%'
    )
      and (p_order_status is null or r.status = p_order_status)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (p_from is null or r.placed_at >= p_from::timestamptz)
      and (p_to is null or r.placed_at < (p_to + 1)::timestamptz)
  )
  select count(*) into v_total from filtered;

  with filtered as (
    select *
    from public.admin_order_rows(p_admin) r
    where (
      v_search is null
      or r.code ilike '%' || v_search || '%'
      or r.customer_name ilike '%' || v_search || '%'
      or r.customer_email ilike '%' || v_search || '%'
    )
      and (p_order_status is null or r.status = p_order_status)
      and (p_payment_status is null or r.payment_status = p_payment_status)
      and (p_from is null or r.placed_at >= p_from::timestamptz)
      and (p_to is null or r.placed_at < (p_to + 1)::timestamptz)
  ),
  page_rows as (
    select *
    from filtered
    order by
      case when p_sort = 'oldest' then placed_at end asc,
      case when p_sort = 'total_asc' then total end asc,
      case when p_sort = 'total_desc' then total end desc,
      case when p_sort = 'code_asc' then code end asc,
      case when p_sort not in ('oldest', 'total_asc', 'total_desc', 'code_asc') then placed_at end desc,
      id desc
    limit v_page_size
    offset (v_page - 1) * v_page_size
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb)
  into v_orders
  from page_rows;

  return jsonb_build_object(
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'orders', v_orders
  );
end;
$$;

create or replace function public.admin_confirm_bank_order_payment(
  p_admin uuid,
  p_order uuid,
  p_payment uuid,
  p_amount numeric,
  p_transfer_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_parent public.orders%rowtype;
  v_child record;
  v_item record;
  v_availability public.product_availability%rowtype;
  v_reference text := nullif(trim(coalesce(p_transfer_reference, '')), '');
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount is null or p_amount <= 0 or length(coalesce(v_reference, '')) < 3 then
    raise exception 'VALIDATION: amount and bank reference are required';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment
  for update;
  if not found or v_payment.purpose <> 'ORDER' or v_payment.reference_id <> p_order then
    raise exception 'NOT_FOUND: order payment';
  end if;
  if v_payment.status not in ('CREATED', 'PENDING') then
    raise exception 'INVALID_STATE: payment is not awaiting confirmation';
  end if;
  if v_payment.amount <> p_amount then
    raise exception 'AMOUNT_MISMATCH';
  end if;
  if exists (
    select 1 from public.payment_transactions
    where provider = 'BANK_TRANSFER' and provider_txn_id = v_reference and type = 'PAYMENT'
  ) then
    raise exception 'INVALID_STATE: bank reference has already been recorded';
  end if;

  select * into v_parent
  from public.orders
  where id = v_payment.reference_id and order_level = 'PARENT'
  for update;
  if not found or v_parent.status not in ('CREATED', 'PAYMENT_PENDING') then
    raise exception 'INVALID_STATE: parent order cannot be paid';
  end if;
  if not exists (
    select 1 from public.orders
    where parent_order_id = v_parent.id
  ) or exists (
    select 1 from public.orders
    where parent_order_id = v_parent.id and status <> 'CREATED'
  ) then
    raise exception 'INVALID_STATE: one or more sub-orders are no longer awaiting payment';
  end if;

  insert into public.payment_transactions (
    payment_id, type, provider, provider_txn_id, amount, status, response
  )
  values (
    v_payment.id, 'PAYMENT', 'BANK_TRANSFER', v_reference, p_amount, 'SUCCESS',
    jsonb_build_object('confirmed_by', p_admin, 'confirmed_at', now())
  );

  update public.payments
  set status = 'PAID',
      provider = 'bank_transfer',
      business_sync_status = 'PENDING_SYNC',
      updated_at = now()
  where id = v_payment.id;

  for v_item in
    select oi.product_id, sum(oi.qty)::integer as qty
    from public.order_items oi
    join public.orders child on child.id = oi.order_id
    where child.parent_order_id = v_parent.id
    group by oi.product_id
    order by oi.product_id
  loop
    select * into v_availability
    from public.product_availability
    where product_id = v_item.product_id
    for update;
    if not found
       or v_availability.available_qty < v_item.qty
       or v_availability.reserved_qty < v_item.qty then
      raise exception 'INVENTORY_RESERVATION_INVALID:%', v_item.product_id;
    end if;

    update public.product_availability
    set available_qty = available_qty - v_item.qty,
        reserved_qty = reserved_qty - v_item.qty,
        version = version + 1,
        updated_at = now()
    where product_id = v_item.product_id;

    insert into public.product_availability_history (
      product_id, change_type, qty_before, qty_after, ref_type, ref_id, actor_id
    )
    values (
      v_item.product_id, 'COMMIT',
      v_availability.available_qty,
      v_availability.available_qty - v_item.qty,
      'ORDER', v_parent.id, p_admin
    );
  end loop;

  update public.payments
  set business_sync_status = 'SYNCED',
      updated_at = now()
  where id = v_payment.id;

  update public.orders
  set status = 'PAID', updated_at = now()
  where id = v_parent.id;
  insert into public.order_status_history (
    order_id, from_status, to_status, actor_id, actor_role, reason
  )
  values (
    v_parent.id, v_parent.status, 'PAID', p_admin, 'ADMIN',
    'Xác nhận chuyển khoản ' || v_reference
  );

  for v_child in
    update public.orders
    set status = 'PENDING_ACCEPTANCE', updated_at = now()
    where parent_order_id = v_parent.id and status = 'CREATED'
    returning id
  loop
    insert into public.order_status_history (
      order_id, from_status, to_status, actor_id, actor_role, reason
    )
    values (
      v_child.id, 'CREATED', 'PENDING_ACCEPTANCE', p_admin, 'ADMIN',
      'Thanh toán đơn hàng tổng được xác nhận'
    );
  end loop;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_admin, 'ADMIN', 'ORDER_BANK_PAYMENT_CONFIRMED', 'payment', v_payment.id::text,
    jsonb_build_object(
      'order_id', v_parent.id,
      'amount', p_amount,
      'transfer_reference', v_reference
    )
  );

  return jsonb_build_object('ok', true, 'payment_id', v_payment.id, 'order_id', v_parent.id);
end;
$$;

create or replace function public.admin_cancel_unpaid_order(
  p_admin uuid,
  p_order uuid,
  p_reason text,
  p_received_via text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.orders%rowtype;
  v_child record;
  v_item record;
  v_availability public.product_availability%rowtype;
  v_request uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if length(coalesce(v_reason, '')) < 3 then
    raise exception 'INVALID_REASON';
  end if;

  select * into v_parent
  from public.orders
  where id = p_order and order_level = 'PARENT'
  for update;
  if not found then
    raise exception 'NOT_FOUND: parent order';
  end if;
  if v_parent.status not in ('CREATED', 'PAYMENT_PENDING') then
    raise exception 'INVALID_STATE: only unpaid orders can be cancelled';
  end if;
  if exists (
    select 1 from public.payments
    where purpose = 'ORDER'
      and reference_id = v_parent.id
      and status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
  ) then
    raise exception 'INVALID_STATE: paid orders must be handled through the return and refund process';
  end if;
  if not exists (
    select 1 from public.orders where parent_order_id = v_parent.id
  ) or exists (
    select 1 from public.orders
    where parent_order_id = v_parent.id and status <> 'CREATED'
  ) then
    raise exception 'INVALID_STATE: one or more sub-orders have started processing';
  end if;

  insert into public.order_admin_requests (
    order_id, request_type, status, reason, received_via, requested_by
  )
  values (
    v_parent.id, 'CANCELLATION', 'COMPLETED', v_reason,
    nullif(trim(coalesce(p_received_via, '')), ''), p_admin
  )
  returning id into v_request;

  for v_item in
    select oi.product_id, sum(oi.qty)::integer as qty
    from public.order_items oi
    join public.orders child on child.id = oi.order_id
    where child.parent_order_id = v_parent.id
    group by oi.product_id
    order by oi.product_id
  loop
    select * into v_availability
    from public.product_availability
    where product_id = v_item.product_id
    for update;
    if not found or v_availability.reserved_qty < v_item.qty then
      raise exception 'INVENTORY_RESERVATION_INVALID:%', v_item.product_id;
    end if;

    update public.product_availability
    set reserved_qty = reserved_qty - v_item.qty,
        version = version + 1,
        updated_at = now()
    where product_id = v_item.product_id;

    insert into public.product_availability_history (
      product_id, change_type, qty_before, qty_after, ref_type, ref_id, actor_id
    )
    values (
      v_item.product_id, 'RELEASE',
      v_availability.reserved_qty,
      v_availability.reserved_qty - v_item.qty,
      'ORDER', v_parent.id, p_admin
    );
  end loop;

  update public.payments
  set status = 'CANCELLED', updated_at = now()
  where purpose = 'ORDER'
    and reference_id = v_parent.id
    and status in ('CREATED', 'PENDING');

  for v_child in
    update public.orders
    set status = 'CANCELLED', updated_at = now()
    where parent_order_id = v_parent.id
    returning id, status
  loop
    insert into public.order_status_history (
      order_id, from_status, to_status, actor_id, actor_role, reason
    )
    values (
      v_child.id, 'CREATED', 'CANCELLED', p_admin, 'ADMIN', v_reason
    );
  end loop;

  update public.orders
  set status = 'CANCELLED', updated_at = now()
  where id = v_parent.id;
  insert into public.order_status_history (
    order_id, from_status, to_status, actor_id, actor_role, reason
  )
  values (
    v_parent.id, v_parent.status, 'CANCELLED', p_admin, 'ADMIN', v_reason
  );

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_admin, 'ADMIN', 'ORDER_CANCELLATION_PROCESSED', 'order', v_parent.id::text,
    jsonb_build_object(
      'request_id', v_request,
      'reason', v_reason,
      'received_via', nullif(trim(coalesce(p_received_via, '')), '')
    )
  );

  return jsonb_build_object('ok', true, 'order_id', v_parent.id, 'request_id', v_request);
end;
$$;

create or replace function public.admin_record_order_return_refund(
  p_admin uuid,
  p_order uuid,
  p_amount numeric,
  p_reason text,
  p_received_via text,
  p_transfer_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.orders%rowtype;
  v_payment_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_reference text := nullif(trim(coalesce(p_transfer_reference, '')), '');
  v_refund jsonb;
  v_request uuid;
  v_effective_status text;
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount is null or p_amount <= 0
     or length(coalesce(v_reason, '')) < 3
     or length(coalesce(v_reference, '')) < 3 then
    raise exception 'VALIDATION: amount, reason, and transfer reference are required';
  end if;

  select * into v_parent
  from public.orders
  where id = p_order and order_level = 'PARENT'
  for update;
  if not found then
    raise exception 'NOT_FOUND: parent order';
  end if;
  select order_row.status into v_effective_status
  from public.admin_order_rows(p_admin) order_row
  where order_row.id = v_parent.id;
  if v_effective_status is null
     or v_effective_status not in ('DELIVERED', 'COMPLETED', 'PARTIALLY_REFUNDED') then
    raise exception 'INVALID_STATE: only delivered orders can be returned';
  end if;

  select p.id into v_payment_id
  from public.payments p
  where p.purpose = 'ORDER'
    and p.reference_id = v_parent.id
    and p.status in ('PAID', 'PARTIALLY_REFUNDED')
  order by p.created_at desc
  limit 1
  for update;
  if v_payment_id is null then
    raise exception 'INVALID_STATE: no refundable order payment';
  end if;

  v_refund := public.admin_record_manual_refund(
    p_admin, v_payment_id, p_amount, v_reason, v_reference
  );

  insert into public.order_admin_requests (
    order_id, request_type, status, reason, received_via, requested_by, refund_id
  )
  values (
    v_parent.id, 'RETURN', 'COMPLETED', v_reason,
    nullif(trim(coalesce(p_received_via, '')), ''), p_admin,
    (v_refund->>'refund_id')::uuid
  )
  returning id into v_request;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_admin, 'ADMIN', 'ORDER_RETURN_REFUNDED', 'order', v_parent.id::text,
    jsonb_build_object(
      'request_id', v_request,
      'refund_id', v_refund->>'refund_id',
      'amount', p_amount,
      'reason', v_reason,
      'transfer_reference', v_reference
    )
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_parent.id,
    'request_id', v_request,
    'refund', v_refund
  );
end;
$$;

create or replace function public.admin_update_order_shipment(
  p_admin uuid,
  p_order uuid,
  p_carrier_name text,
  p_tracking_number text,
  p_handed_over_at timestamptz,
  p_delivered_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_previous public.order_shipments%rowtype;
  v_carrier text := nullif(trim(coalesce(p_carrier_name, '')), '');
  v_tracking text := nullif(trim(coalesce(p_tracking_number, '')), '');
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if length(coalesce(v_carrier, '')) < 2 or length(coalesce(v_tracking, '')) < 2 then
    raise exception 'VALIDATION: carrier and tracking number are required';
  end if;
  if p_delivered_at is not null
     and p_handed_over_at is not null
     and p_delivered_at < p_handed_over_at then
    raise exception 'VALIDATION: delivery cannot be earlier than handover';
  end if;

  select * into v_order
  from public.orders
  where id = p_order and order_level = 'CHILD'
  for update;
  if not found then
    raise exception 'NOT_FOUND: sub-order';
  end if;
  if v_order.status not in ('SHIPPED', 'DELIVERED', 'COMPLETED') then
    raise exception 'INVALID_STATE: shipment details require a shipped order';
  end if;

  select * into v_previous
  from public.order_shipments
  where order_id = p_order
  for update;

  insert into public.order_shipments (
    order_id, carrier_name, tracking_number, handed_over_at, delivered_at, updated_by, updated_at
  )
  values (
    p_order, v_carrier, v_tracking, p_handed_over_at, p_delivered_at, p_admin, now()
  )
  on conflict (order_id) do update
  set carrier_name = excluded.carrier_name,
      tracking_number = excluded.tracking_number,
      handed_over_at = excluded.handed_over_at,
      delivered_at = excluded.delivered_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  if p_delivered_at is not null and v_order.status = 'SHIPPED' then
    update public.orders
    set status = 'DELIVERED', updated_at = now()
    where id = p_order;

    insert into public.order_status_history (
      order_id, from_status, to_status, actor_id, actor_role, reason
    )
    values (
      p_order, 'SHIPPED', 'DELIVERED', p_admin, 'ADMIN',
      'Admin ghi nhận thời điểm giao hàng'
    );
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, before, after
  )
  values (
    p_admin, 'ADMIN', 'ORDER_SHIPMENT_UPDATED', 'order', p_order::text,
    case when v_previous.order_id is null then null else
      jsonb_build_object(
        'carrier_name', v_previous.carrier_name,
        'tracking_number', v_previous.tracking_number,
        'handed_over_at', v_previous.handed_over_at,
        'delivered_at', v_previous.delivered_at
      )
    end,
    jsonb_build_object(
      'carrier_name', v_carrier,
      'tracking_number', v_tracking,
      'handed_over_at', p_handed_over_at,
      'delivered_at', p_delivered_at
    )
  );

  return jsonb_build_object('ok', true, 'order_id', p_order);
end;
$$;

revoke all on function public.admin_order_rows(uuid) from public, anon, authenticated;
revoke all on function public.admin_order_dashboard_metrics(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_orders(uuid, text, text, text, date, date, text, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_confirm_bank_order_payment(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.admin_cancel_unpaid_order(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_record_order_return_refund(uuid, uuid, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_update_order_shipment(uuid, uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.admin_order_rows(uuid) to service_role;
grant execute on function public.admin_order_dashboard_metrics(uuid) to service_role;
grant execute on function public.admin_list_orders(uuid, text, text, text, date, date, text, integer, integer) to service_role;
grant execute on function public.admin_confirm_bank_order_payment(uuid, uuid, uuid, numeric, text) to service_role;
grant execute on function public.admin_cancel_unpaid_order(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_record_order_return_refund(uuid, uuid, numeric, text, text, text) to service_role;
grant execute on function public.admin_update_order_shipment(uuid, uuid, text, text, timestamptz, timestamptz) to service_role;
