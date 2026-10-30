
-- OCOP Hub — 0003_functions.sql
-- Các hàm nghiệp vụ quan trọng chạy nguyên tử phía Postgres.
-- Lý do: Supabase client không hỗ trợ multi-statement transaction → đặt trong RPC.

-- ============ Helpers ============
create or replace function public.gen_order_code()
returns text language plpgsql as $$
declare d text; n bigint;
begin
  d := to_char(now(), 'YYMMDD');
  n := (random() * 999999)::bigint;
  return 'OC' || d || lpad(n::text, 6, '0');
end $$;

create or replace function public.gen_reg_code()
returns text language plpgsql as $$
begin
  return 'WS' || to_char(now(), 'YYMMDD') || lpad((random()*999999)::bigint::text, 6, '0');
end $$;

create or replace function public.fee_for(p_partner uuid, p_type text)
returns numeric language sql stable as $$
  select coalesce(
    (select (rules->>'rate')::numeric
       from public.fee_config
      where type = p_type
        and (scope = 'PARTNER' and partner_id = p_partner or (scope = 'GLOBAL' and partner_id is null))
        and effective_from <= now()
        and (effective_to is null or effective_to > now())
      order by scope desc
      limit 1),
    0
  );
$$;

create or replace function public.shipping_for(p_partner uuid, p_subtotal numeric)
returns numeric language sql stable as $$
  select coalesce(
    (select (rules->>'flat')::numeric
       from public.fee_config
      where type = 'SHIPPING'
        and (scope = 'PARTNER' and partner_id = p_partner or (scope = 'GLOBAL' and partner_id is null))
        and effective_from <= now()
        and (effective_to is null or effective_to > now())
      order by scope desc
      limit 1),
    0
  );
$$;

-- ============ CHECKOUT ============
-- p_items: [{"product_id":"uuid","qty":2}, ...] từ giỏ hàng của customer.
-- Giữ chỗ (reserve), tạo Parent Order + Child Orders, trả về parent.
create or replace function public.checkout(
  p_customer uuid,
  p_idempotency_key text,
  p_shipping_address jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_parent orders%rowtype;
  v_item record;
  v_partner uuid;
  v_avail int; v_reserved int; v_supply supply_status;
  v_price numeric; v_name text; v_img text;
  v_line numeric; v_sub numeric; v_ship numeric; v_plat numeric; v_total numeric;
  v_child uuid; v_agg jsonb; v_partners uuid[];
begin
  -- Idempotent: nếu đã tạo đơn với key này → trả lại
  select * into v_parent from public.orders
   where customer_id = p_customer and idempotency_key = p_idempotency_key and order_level = 'PARENT';
  if found then
    return jsonb_build_object('order_id', v_parent.id, 'code', v_parent.code, 'status', v_parent.status, 'duplicated', true);
  end if;

  if p_shipping_address is null or coalesce(p_shipping_address->>'receiver_name','') = ''
     or coalesce(p_shipping_address->>'phone','') = '' or coalesce(p_shipping_address->>'address','') = '' then
    raise exception 'INVALID_ADDRESS';
  end if;

  -- Tính tổng theo Partner (lock dòng availability theo thứ tự id → tránh deadlock)
  for v_item in
    select ci.product_id, sum(ci.qty)::int as qty
      from cart_items ci
      join carts c on c.id = ci.cart_id
     where c.customer_id = p_customer
     group by ci.product_id
     order by ci.product_id
  loop
    select p.partner_id, p.price, p.name,
           (select url from product_images pi where pi.product_id = p.id order by sort_order limit 1)
      into v_partner, v_price, v_name, v_img
      from products p where p.id = v_item.product_id and p.status = 'APPROVED';
    if not found then
      raise exception 'PRODUCT_NOT_AVAILABLE:%', v_item.product_id;
    end if;

    select available_qty, reserved_qty, supply_status
      into v_avail, v_reserved, v_supply
      from product_availability where product_id = v_item.product_id for update;

    if not found or v_avail - v_reserved < v_item.qty then
      raise exception 'INSUFFICIENT_SUPPLY:%', v_item.product_id;
    end if;
  end loop;

  -- Tạo parent
  insert into orders (code, customer_id, order_level, status, idempotency_key, shipping_address)
  values (gen_order_code(), p_customer, 'PARENT', 'PAYMENT_PENDING', p_idempotency_key, p_shipping_address)
  returning * into v_parent;

  -- Tạo child theo từng partner
  for v_agg in
    select jsonb_build_object(
      'partner', p.partner_id,
      'items',
      jsonb_agg(
        jsonb_build_object(
          'product_id', q.product_id,
          'qty', q.qty,
          'price', p.price,
          'name', p.name,
          'image', (
            select url
            from product_images pi
            where pi.product_id = p.id
            order by sort_order
            limit 1
          )
        )
      )
    )
    from (
      select ci.product_id, sum(ci.qty)::int as qty
      from cart_items ci
      join carts c on c.id = ci.cart_id
      where c.customer_id = p_customer
      group by ci.product_id
    ) q
    join products p on p.id = q.product_id
    where p.status = 'APPROVED'
    group by p.partner_id
  loop
    v_partner := (v_agg->>'partner')::uuid;
    v_sub := 0;

    insert into orders (code, customer_id, order_level, parent_order_id, partner_id, status)
    values (gen_order_code(), p_customer, 'CHILD', v_parent.id, v_partner, 'CREATED')
    returning id into v_child;

    for v_item in
      select value as item
      from jsonb_array_elements(v_agg->'items')
    loop
      v_price := (v_item.item->>'price')::numeric;
      v_line := v_price * (v_item.item->>'qty')::int;

      insert into order_items (
        order_id, product_id, partner_id, product_name,
        product_image, unit_price, qty, line_total
      )
      values (
        v_child,
        (v_item.item->>'product_id')::uuid,
        v_partner,
        v_item.item->>'name',
        v_item.item->>'image',
        v_price,
        (v_item.item->>'qty')::int,
        v_line
      );

      v_sub := v_sub + v_line;
    end loop;

    v_ship := shipping_for(v_partner, v_sub);
    v_plat := round(v_sub * fee_for(v_partner, 'PLATFORM_RATE'), 0);

    update orders
       set subtotal = v_sub,
           shipping_fee = v_ship,
           platform_fee = v_plat,
           total = v_sub + v_ship
     where id = v_child;

    -- Reserve số lượng khai báo
    for v_item in
      select
        x.item->>'product_id' as product_id,
        (x.item->>'qty')::int as qty
      from jsonb_array_elements(v_agg->'items') as x(item)
    loop
      select available_qty, reserved_qty
        into v_avail, v_reserved
        from product_availability
       where product_id = v_item.product_id::uuid
       for update;

      update product_availability
         set reserved_qty = reserved_qty + v_item.qty,
             version = version + 1,
             updated_at = now()
       where product_id = v_item.product_id::uuid
         and available_qty - reserved_qty >= v_item.qty;

      if not found then
        raise exception 'INSUFFICIENT_SUPPLY:%', v_item.product_id;
      end if;

      insert into product_availability_history (
        product_id, change_type, qty_before, qty_after,
        ref_type, ref_id, actor_id
      )
      values (
        v_item.product_id::uuid,
        'RESERVE',
        v_avail,
        v_avail - v_item.qty,
        'ORDER',
        v_child,
        p_customer
      );
    end loop;

    v_partners := array_append(coalesce(v_partners, array[]::uuid[]), v_partner);
  end loop;

  -- Tổng parent = tổng children
  -- Lưu ý: cú pháp PostgreSQL đúng là UPDATE ... SET ... FROM ... WHERE
  update orders
     set subtotal = s.sub,
         shipping_fee = s.ship,
         platform_fee = s.plat,
         total = s.tot
    from (
      select
        coalesce(sum(subtotal), 0) as sub,
        coalesce(sum(shipping_fee), 0) as ship,
        coalesce(sum(platform_fee), 0) as plat,
        coalesce(sum(subtotal + shipping_fee), 0) as tot
      from orders
      where parent_order_id = v_parent.id
    ) s
   where orders.id = v_parent.id;

  -- Xóa giỏ hàng
  delete from cart_items
   where cart_id in (
     select id from carts where customer_id = p_customer
   );

  select * into v_parent from orders where id = v_parent.id;

  return jsonb_build_object(
    'order_id', v_parent.id,
    'code', v_parent.code,
    'status', v_parent.status,
    'total', v_parent.total,
    'duplicated', false
  );
end $$;

-- ============ APPLY PAYMENT SUCCESS ============
-- Idempotent: chỉ áp dụng 1 lần; nếu business update fail → giữ PAID + PENDING_SYNC.
drop function if exists public.apply_payment_success(uuid, text, text, text, numeric);

create or replace function public.apply_payment_success(
  p_payment_id uuid,
  p_provider text,
  p_provider_txn_id text,
  p_event_id text,
  p_amount numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_payment payments%rowtype;
  v_already boolean;
  v_item record;
begin
  -- Ghi nhận event chống trùng (webhook retry)
  begin
    insert into payment_events (payment_id, event_id, signature_valid, raw, processed)
    values (
      p_payment_id,
      p_event_id,
      true,
      jsonb_build_object('provider', p_provider, 'txn', p_provider_txn_id),
      false
    );
  exception when unique_violation then
    return jsonb_build_object('result', 'DUPLICATE_EVENT');
  end;

  select * into v_payment
    from public.payments
   where id = p_payment_id
   for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  -- Số tiền phải khớp
  if v_payment.amount <> p_amount then
    raise exception 'AMOUNT_MISMATCH: expected %, got %', v_payment.amount, p_amount;
  end if;

  insert into payment_transactions (
    payment_id, type, provider, provider_txn_id, amount, status
  )
  values (
    p_payment_id, 'PAYMENT', p_provider, p_provider_txn_id, p_amount, 'SUCCESS'
  )
  on conflict (provider, provider_txn_id, type) do nothing;

  if v_payment.status = 'PAID' then
    update payment_events set processed = true where event_id = p_event_id;
    return jsonb_build_object('result', 'ALREADY_PAID');
  end if;

  if v_payment.status not in ('PENDING', 'CREATED', 'FAILED') then
    raise exception 'INVALID_PAYMENT_STATE:%', v_payment.status;
  end if;

  update payments
     set status = 'PAID',
         updated_at = now()
   where id = p_payment_id
     and status in ('CREATED', 'PENDING', 'FAILED');

  -- Áp dụng nghiệp vụ trong subtransaction riêng
  -- (exception → rollback business, payment vẫn PAID)
  begin
    if v_payment.purpose = 'ORDER' then
      update orders
         set status = 'PAID',
             updated_at = now()
       where id = v_payment.reference_id
         and status in ('PAYMENT_PENDING', 'CREATED');

      if not found then
        raise exception 'ORDER_STATE_INVALID';
      end if;

      update orders
         set status = 'PENDING_ACCEPTANCE',
             updated_at = now()
       where parent_order_id = v_payment.reference_id
         and status = 'CREATED';

      insert into order_status_history (
        order_id, from_status, to_status, actor_role, reason
      )
      select
        id, 'PAYMENT_PENDING', 'PAID', 'SYSTEM', 'webhook:' || p_provider
      from orders
      where id = v_payment.reference_id;

      -- COMMIT reserved → giảm available
      for v_item in
        select oi.product_id, oi.qty
        from order_items oi
        join orders o on o.id = oi.order_id
        where o.parent_order_id = v_payment.reference_id
      loop
        update product_availability
           set available_qty = available_qty - v_item.qty,
               reserved_qty = greatest(reserved_qty - v_item.qty, 0),
               version = version + 1,
               updated_at = now()
         where product_id = v_item.product_id;

        insert into product_availability_history (
          product_id, change_type, qty_before, qty_after, ref_type, ref_id
        )
        values (
          v_item.product_id,
          'COMMIT',
          (
            select available_qty + v_item.qty
            from product_availability
            where product_id = v_item.product_id
          ),
          (
            select available_qty
            from product_availability
            where product_id = v_item.product_id
          ),
          'ORDER',
          v_payment.reference_id
        );
      end loop;

    elsif v_payment.purpose = 'WORKSHOP_REGISTRATION' then
      update workshop_registrations
         set status = 'CONFIRMED',
             hold_expires_at = null,
             updated_at = now()
       where id = v_payment.reference_id
         and status in ('PENDING', 'PAYMENT_PROCESSING');

      if not found then
        raise exception 'REGISTRATION_STATE_INVALID';
      end if;
    end if;

    update payments
       set business_sync_status = 'SYNCED',
           updated_at = now()
     where id = p_payment_id;

    update payment_events
       set processed = true
     where event_id = p_event_id;

  exception when others then
    update payments
       set business_sync_status = 'PENDING_SYNC',
           updated_at = now()
     where id = p_payment_id;

    insert into audit_logs (
      actor_role, action, entity_type, entity_id, after
    )
    values (
      'SYSTEM',
      'PAYMENT_BUSINESS_SYNC_FAILED',
      'payment',
      p_payment_id::text,
      jsonb_build_object('error', SQLERRM)
    );
  end;

  return jsonb_build_object('result', 'APPLIED', 'payment_id', p_payment_id);
end $$;

-- ============ EXPIRE HOLDS ============
-- Trả chỗ / hủy đơn khi payment hết hạn giữ chỗ.
create or replace function public.expire_holds()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_payment record;
  v_item record;
begin
  for v_payment in
    select *
    from payments
    where status in ('PENDING', 'CREATED')
      and expires_at is not null
      and expires_at < now()
    for update
  loop
    update payments
       set status = 'EXPIRED',
           updated_at = now()
     where id = v_payment.id;

    if v_payment.purpose = 'ORDER' then
      update orders
         set status = 'EXPIRED',
             updated_at = now()
       where (id = v_payment.reference_id or parent_order_id = v_payment.reference_id)
         and status in ('CREATED', 'PAYMENT_PENDING');

      for v_item in
        select oi.product_id, sum(oi.qty)::int as qty
        from order_items oi
        join orders o on o.id = oi.order_id
        where o.parent_order_id = v_payment.reference_id
        group by oi.product_id
      loop
        update product_availability
           set reserved_qty = greatest(reserved_qty - v_item.qty, 0),
               version = version + 1,
               updated_at = now()
         where product_id = v_item.product_id;

        insert into product_availability_history (
          product_id, change_type, qty_before, qty_after, ref_type, ref_id
        )
        values (
          v_item.product_id,
          'RELEASE',
          (
            select reserved_qty + v_item.qty
            from product_availability
            where product_id = v_item.product_id
          ),
          (
            select reserved_qty
            from product_availability
            where product_id = v_item.product_id
          ),
          'ORDER',
          v_payment.reference_id
        );
      end loop;

    elsif v_payment.purpose = 'WORKSHOP_REGISTRATION' then
      update workshop_registrations
         set status = 'CANCELLED_PAYMENT_FAILED',
             updated_at = now()
       where id = v_payment.reference_id
         and status in ('PENDING', 'PAYMENT_PROCESSING');

      if found then
        update workshop_sessions
           set remaining_seats = least(remaining_seats + 1, capacity),
               updated_at = now()
         where id = (
           select session_id
           from workshop_registrations
           where id = v_payment.reference_id
         );
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('expired', v_count);
end $$;

-- ============ RETRY BUSINESS SYNC ============
create or replace function public.sync_pending_payments()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_ok int := 0;
  v_fail int := 0;
begin
  for v in
    select id
    from payments
    where status = 'PAID'
      and business_sync_status = 'PENDING_SYNC'
    for update
  loop
    begin
      if (select purpose from payments where id = v.id) = 'ORDER' then
        update orders
           set status = 'PAID',
               updated_at = now()
         where id = (select reference_id from payments where id = v.id)
           and status in ('PAYMENT_PENDING', 'CREATED');

        update orders
           set status = 'PENDING_ACCEPTANCE',
               updated_at = now()
         where parent_order_id = (select reference_id from payments where id = v.id)
           and status = 'CREATED';
      else
        update workshop_registrations
           set status = 'CONFIRMED',
               hold_expires_at = null,
               updated_at = now()
         where id = (select reference_id from payments where id = v.id)
           and status in ('PENDING', 'PAYMENT_PROCESSING');
      end if;

      update payments
         set business_sync_status = 'SYNCED',
             updated_at = now()
       where id = v.id;

      v_ok := v_ok + 1;

    exception when others then
      v_fail := v_fail + 1;
    end;
  end loop;

  return jsonb_build_object('synced', v_ok, 'failed', v_fail);
end $$;

-- ============ SETTLEMENT GENERATE ============
create or replace function public.generate_settlement(
  p_partner uuid,
  p_start date,
  p_end date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sid uuid;
  v record;
  v_gross numeric := 0;
  v_refund numeric := 0;
  v_plat numeric := 0;
  v_net numeric;
begin
  insert into settlement_statements (partner_id, period_start, period_end)
  values (p_partner, p_start, p_end)
  on conflict (partner_id, period_start, period_end) do nothing
  returning id into v_sid;

  if v_sid is null then
    select id into v_sid
    from settlement_statements
    where partner_id = p_partner
      and period_start = p_start
      and period_end = p_end;

    return jsonb_build_object('statement_id', v_sid, 'exists', true);
  end if;

  for v in
    select o.id, o.subtotal, o.platform_fee
    from orders o
    where o.partner_id = p_partner
      and o.order_level = 'CHILD'
      and o.status in (
        'COMPLETED', 'DELIVERED', 'SHIPPED', 'PROCESSING',
        'ACCEPTED', 'PENDING_ACCEPTANCE', 'PAID'
      )
      and o.placed_at::date between p_start and p_end
  loop
    v_gross := v_gross + v.subtotal;
    v_plat := v_plat + v.platform_fee;

    insert into settlement_items (
      statement_id, ref_type, ref_id, amount, direction
    )
    values (
      v_sid, 'SUB_ORDER', v.id, v.subtotal, 'CREDIT'
    )
    on conflict (statement_id, ref_type, ref_id) do nothing;
  end loop;

  for v in
    select r.id, r.amount
    from refunds r
    join payments p on p.id = r.payment_id
    join orders o on o.id = p.reference_id
    where p.purpose = 'ORDER'
      and o.partner_id = p_partner
      and r.status = 'COMPLETED'
      and r.created_at::date between p_start and p_end
  loop
    v_refund := v_refund + v.amount;

    insert into settlement_items (
      statement_id, ref_type, ref_id, amount, direction
    )
    values (
      v_sid, 'REFUND', v.id, v.amount, 'DEBIT'
    )
    on conflict (statement_id, ref_type, ref_id) do nothing;
  end loop;

  v_net := v_gross - v_refund - v_plat;

  update settlement_statements
     set gross_amount = v_gross,
         refund_amount = v_refund,
         platform_fee = v_plat,
         net_payable = v_net
   where id = v_sid;

  return jsonb_build_object(
    'statement_id', v_sid,
    'gross', v_gross,
    'refund', v_refund,
    'platform_fee', v_plat,
    'net', v_net
  );
end $$;

-- ============ WORKSHOP REGISTER (atomic seat hold) ============
create or replace function public.register_workshop(
  p_session uuid,
  p_customer uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_session workshop_sessions%rowtype;
  v_reg uuid;
  v_code text;
  v_hold timestamptz;
begin
  select * into v_session
  from public.workshop_sessions
  where id = p_session
  for update;

  if not found or v_session.status <> 'OPEN' then
    raise exception 'SESSION_NOT_OPEN';
  end if;

  if v_session.starts_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  v_code := gen_reg_code();

  v_hold := now() + (
    coalesce(
      nullif(current_setting('app.hold_ttl_minutes', true), ''),
      '30'
    ) || ' minutes'
  )::interval;

  begin
    insert into workshop_registrations (
      code, session_id, customer_id, status, amount, hold_expires_at
    )
    values (
      v_code, p_session, p_customer, 'PENDING', v_session.fee, v_hold
    )
    returning id into v_reg;

  exception when unique_violation then
    raise exception 'ALREADY_REGISTERED';
  end;

  update workshop_sessions
     set remaining_seats = remaining_seats - 1,
         updated_at = now()
   where id = p_session
     and remaining_seats > 0;

  if not found then
    raise exception 'NO_SEATS';
  end if;

  return jsonb_build_object(
    'registration_id', v_reg,
    'code', v_code,
    'amount', v_session.fee,
    'hold_expires_at', v_hold
  );
end $$;

-- ============ WORKSHOP CANCEL (trả chỗ) ============
create or replace function public.cancel_registration(
  p_registration uuid,
  p_actor uuid,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v workshop_registrations%rowtype;
begin
  select * into v
  from workshop_registrations
  where id = p_registration
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v.status not in ('PENDING', 'PAYMENT_PROCESSING', 'CONFIRMED') then
    raise exception 'INVALID_STATE:%', v.status;
  end if;

  if v.customer_id <> p_actor
     and not public.is_admin()
     and not exists (
       select 1
       from workshops w
       join workshop_sessions s on s.workshop_id = w.id
       where s.id = v.session_id
         and w.partner_id = p_actor
     ) then
    raise exception 'FORBIDDEN';
  end if;

  update workshop_registrations
     set status = 'CANCELLED_BY_CUSTOMER',
         updated_at = now()
   where id = p_registration;

  update workshop_sessions
     set remaining_seats = least(remaining_seats + 1, capacity),
         updated_at = now()
   where id = v.session_id;

  return jsonb_build_object(
    'result', 'CANCELLED',
    'was_status', v.status,
    'requires_refund', v.status = 'CONFIRMED'
  );
end $$;
