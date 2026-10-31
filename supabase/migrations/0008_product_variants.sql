alter table public.products
  add column if not exists classifications text[] not null default '{}';

alter table public.products
  drop constraint if exists products_classifications_check;

alter table public.products
  add constraint products_classifications_check
  check (classifications <@ array['Đặc sản', 'Quà tặng', 'Đồ lưu niệm', 'Khác']::text[]);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  price numeric(12,2) not null check (price > 0),
  created_at timestamptz not null default now()
);

create unique index uq_product_variants_label
  on public.product_variants(product_id, lower(label));
create index idx_product_variants_product on public.product_variants(product_id);

alter table public.product_variants enable row level security;

create policy product_variants_select on public.product_variants for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (p.status = 'APPROVED' or p.partner_id = auth.uid() or public.is_admin())
    )
  );

create policy product_variants_insert_partner on public.product_variants for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.partner_id = auth.uid()
        and p.status = 'DRAFT'
        and public.is_partner_approved()
    )
  );

alter table public.cart_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete restrict;

alter table public.cart_items
  drop constraint if exists cart_items_cart_id_product_id_key;

create unique index uq_cart_items_product_without_variant
  on public.cart_items(cart_id, product_id)
  where variant_id is null;

create unique index uq_cart_items_product_variant
  on public.cart_items(cart_id, product_id, variant_id)
  where variant_id is not null;

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
  v_avail int;
  v_reserved int;
  v_sub numeric;
  v_ship numeric;
  v_plat numeric;
  v_line numeric;
  v_price numeric;
  v_child uuid;
  v_agg jsonb;
  v_partners uuid[];
begin
  select * into v_parent
    from public.orders
   where customer_id = p_customer
     and idempotency_key = p_idempotency_key
     and order_level = 'PARENT';
  if found then
    return jsonb_build_object(
      'order_id', v_parent.id,
      'code', v_parent.code,
      'status', v_parent.status,
      'duplicated', true
    );
  end if;

  if p_shipping_address is null
     or coalesce(p_shipping_address->>'receiver_name', '') = ''
     or coalesce(p_shipping_address->>'phone', '') = ''
     or coalesce(p_shipping_address->>'address', '') = '' then
    raise exception 'INVALID_ADDRESS';
  end if;

  for v_item in
    select ci.product_id, ci.variant_id, sum(ci.qty)::int as qty
      from public.cart_items ci
      join public.carts c on c.id = ci.cart_id
     where c.customer_id = p_customer
     group by ci.product_id, ci.variant_id
     order by ci.product_id, ci.variant_id
  loop
    select p.partner_id, coalesce(pv.price, p.price)
      into v_partner, v_price
      from public.products p
      left join public.product_variants pv
        on pv.id = v_item.variant_id and pv.product_id = p.id
     where p.id = v_item.product_id
       and p.status = 'APPROVED'
       and (v_item.variant_id is null or pv.id is not null);
    if not found then
      raise exception 'PRODUCT_NOT_AVAILABLE:%', v_item.product_id;
    end if;

    if v_item.variant_id is null and exists (
      select 1 from public.product_variants pv where pv.product_id = v_item.product_id
    ) then
      raise exception 'PRODUCT_VARIANT_REQUIRED:%', v_item.product_id;
    end if;
  end loop;

  for v_item in
    select ci.product_id, sum(ci.qty)::int as qty
      from public.cart_items ci
      join public.carts c on c.id = ci.cart_id
     where c.customer_id = p_customer
     group by ci.product_id
     order by ci.product_id
  loop
    select available_qty, reserved_qty
      into v_avail, v_reserved
      from public.product_availability
     where product_id = v_item.product_id
     for update;

    if not found or v_avail - v_reserved < v_item.qty then
      raise exception 'INSUFFICIENT_SUPPLY:%', v_item.product_id;
    end if;
  end loop;

  insert into public.orders (code, customer_id, order_level, status, idempotency_key, shipping_address)
  values (public.gen_order_code(), p_customer, 'PARENT', 'PAYMENT_PENDING', p_idempotency_key, p_shipping_address)
  returning * into v_parent;

  for v_agg in
    select jsonb_build_object(
      'partner', p.partner_id,
      'items',
      jsonb_agg(
        jsonb_build_object(
          'product_id', q.product_id,
          'variant_id', q.variant_id,
          'variant_label', pv.label,
          'qty', q.qty,
          'price', coalesce(pv.price, p.price),
          'name', p.name,
          'image', (
            select pi.url
              from public.product_images pi
             where pi.product_id = p.id
             order by pi.sort_order
             limit 1
          )
        )
        order by q.product_id, q.variant_id
      )
    )
      from (
        select ci.product_id, ci.variant_id, sum(ci.qty)::int as qty
          from public.cart_items ci
          join public.carts c on c.id = ci.cart_id
         where c.customer_id = p_customer
         group by ci.product_id, ci.variant_id
      ) q
      join public.products p on p.id = q.product_id and p.status = 'APPROVED'
      left join public.product_variants pv
        on pv.id = q.variant_id and pv.product_id = p.id
     group by p.partner_id
  loop
    v_partner := (v_agg->>'partner')::uuid;
    v_sub := 0;

    insert into public.orders (code, customer_id, order_level, parent_order_id, partner_id, status)
    values (public.gen_order_code(), p_customer, 'CHILD', v_parent.id, v_partner, 'CREATED')
    returning id into v_child;

    for v_item in
      select value as item from jsonb_array_elements(v_agg->'items')
    loop
      v_price := (v_item.item->>'price')::numeric;
      v_line := v_price * (v_item.item->>'qty')::int;

      insert into public.order_items (
        order_id, product_id, partner_id, product_name,
        product_image, unit_price, qty, line_total
      )
      values (
        v_child,
        (v_item.item->>'product_id')::uuid,
        v_partner,
        (v_item.item->>'name') || case
            when coalesce(v_item.item->>'variant_label', '') = '' then ''
            else ' (' || (v_item.item->>'variant_label') || ')'
          end,
        v_item.item->>'image',
        v_price,
        (v_item.item->>'qty')::int,
        v_line
      );

      v_sub := v_sub + v_line;
    end loop;

    v_ship := public.shipping_for(v_partner, v_sub);
    v_plat := round(v_sub * public.fee_for(v_partner, 'PLATFORM_RATE'), 0);

    update public.orders
       set subtotal = v_sub,
           shipping_fee = v_ship,
           platform_fee = v_plat,
           total = v_sub + v_ship
     where id = v_child;

    for v_item in
      select (item->>'product_id')::uuid as product_id, sum((item->>'qty')::int)::int as qty
        from jsonb_array_elements(v_agg->'items') as items(item)
       group by (item->>'product_id')::uuid
       order by (item->>'product_id')::uuid
    loop
      select available_qty
        into v_avail
        from public.product_availability
       where product_id = v_item.product_id
       for update;

      update public.product_availability
         set reserved_qty = reserved_qty + v_item.qty,
             version = version + 1,
             updated_at = now()
       where product_id = v_item.product_id
         and available_qty - reserved_qty >= v_item.qty;

      if not found then
        raise exception 'INSUFFICIENT_SUPPLY:%', v_item.product_id;
      end if;

      insert into public.product_availability_history (
        product_id, change_type, qty_before, qty_after, ref_type, ref_id, actor_id
      )
      values (
        v_item.product_id,
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

  update public.orders as parent
     set subtotal = totals.subtotal,
         shipping_fee = totals.shipping_fee,
         platform_fee = totals.platform_fee,
         total = totals.total
    from (
      select
        coalesce(sum(subtotal), 0) as subtotal,
        coalesce(sum(shipping_fee), 0) as shipping_fee,
        coalesce(sum(platform_fee), 0) as platform_fee,
        coalesce(sum(subtotal + shipping_fee), 0) as total
        from public.orders
       where parent_order_id = v_parent.id
    ) totals
   where parent.id = v_parent.id;

  delete from public.cart_items
   where cart_id in (select id from public.carts where customer_id = p_customer);

  select * into v_parent from public.orders where id = v_parent.id;

  return jsonb_build_object(
    'order_id', v_parent.id,
    'code', v_parent.code,
    'status', v_parent.status,
    'total', v_parent.total,
    'duplicated', false
  );
end $$;
