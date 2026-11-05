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
      when children.returned_count = children.child_count then 'RETURNED'
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
      count(*) filter (where c.status = 'RETURNED') as returned_count,
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
  v_child record;
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

  if (v_refund->>'remaining')::numeric = 0 then
    for v_child in
      select c.id, c.status
      from public.orders c
      where c.parent_order_id = v_parent.id
        and c.status in ('DELIVERED', 'COMPLETED')
      for update
    loop
      update public.orders set status = 'RETURNED' where id = v_child.id;

      insert into public.order_status_history (
        order_id, from_status, to_status, actor_id, actor_role, reason
      )
      values (
        v_child.id, v_child.status, 'RETURNED', p_admin, 'ADMIN', v_reason
      );
    end loop;

    update public.orders set status = 'RETURNED' where id = v_parent.id;

    insert into public.order_status_history (
      order_id, from_status, to_status, actor_id, actor_role, reason
    )
    values (
      v_parent.id, v_effective_status::public.order_status, 'RETURNED', p_admin, 'ADMIN', v_reason
    );
  end if;

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
