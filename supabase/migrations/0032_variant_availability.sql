-- Variant-level declared supply for products that have variants.
-- Checkout and reservation stay product-level; product_availability is kept
-- in sync as the aggregate of its variants so existing order flows still work.

create table if not exists public.product_variant_availability (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  available_qty int not null default 0 check (available_qty >= 0),
  supply_status public.supply_status not null default 'OUT_OF_STOCK',
  pre_order_eta date,
  version int not null default 0,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_variant_availability_product
  on public.product_variant_availability(product_id);

alter table public.product_availability_history
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null;

create index if not exists idx_av_history_variant
  on public.product_availability_history(variant_id, created_at);

-- Ensure every product with variants has a product-level availability row.
insert into public.product_availability (product_id, available_qty, reserved_qty, supply_status)
select p.id, 0, 0, 'OUT_OF_STOCK'
from public.products p
where exists (select 1 from public.product_variants pv where pv.product_id = p.id)
  and not exists (select 1 from public.product_availability pa where pa.product_id = p.id)
on conflict (product_id) do nothing;

-- Backfill: split the existing product-level declared quantity evenly across
-- its variants; the remainder goes to the first variant.
with ranked as (
  select
    pv.id,
    pv.product_id,
    row_number() over (partition by pv.product_id order by pv.label, pv.id) as rn,
    count(*) over (partition by pv.product_id) as cnt
  from public.product_variants pv
)
insert into public.product_variant_availability (
  variant_id, product_id, available_qty, supply_status, pre_order_eta, updated_by
)
select
  r.id,
  r.product_id,
  ((pa.available_qty / r.cnt) + case when r.rn = 1 then pa.available_qty % r.cnt else 0 end)::int,
  case
    when pa.supply_status = 'OUT_OF_STOCK' and pa.available_qty > 0 then 'IN_STOCK'::public.supply_status
    else pa.supply_status
  end,
  case when pa.supply_status = 'PRE_ORDER' then pa.pre_order_eta else null end,
  pa.updated_by
from ranked r
join public.product_availability pa on pa.product_id = r.product_id
on conflict (variant_id) do nothing;

-- Recompute the aggregates once, after all rows exist. This avoids the
-- per-row check constraint seeing intermediate totals during backfill.
update public.product_availability pa
set available_qty = s.total_qty,
    supply_status = case
      when s.total_qty > 0 then 'IN_STOCK'::public.supply_status
      when s.pre_order_count > 0 then 'PRE_ORDER'::public.supply_status
      else 'OUT_OF_STOCK'::public.supply_status
    end,
    pre_order_eta = case
      when s.total_qty > 0 then null
      else s.next_eta
    end,
    version = pa.version + 1,
    updated_at = now()
from (
  select
    product_id,
    coalesce(sum(available_qty), 0)::int as total_qty,
    count(*) filter (where supply_status = 'PRE_ORDER') as pre_order_count,
    min(pre_order_eta) filter (where supply_status = 'PRE_ORDER') as next_eta
  from public.product_variant_availability
  group by product_id
) s
where pa.product_id = s.product_id;

create or replace function public.sync_product_availability_from_variants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product uuid;
  v_total int;
  v_status public.supply_status;
  v_eta date;
begin
  if tg_op = 'DELETE' then
    v_product := old.product_id;
  else
    v_product := new.product_id;
  end if;

  select
    coalesce(sum(available_qty), 0)::int,
    case
      when coalesce(sum(available_qty), 0) > 0 then 'IN_STOCK'::public.supply_status
      when count(*) filter (where supply_status = 'PRE_ORDER') > 0 then 'PRE_ORDER'::public.supply_status
      else 'OUT_OF_STOCK'::public.supply_status
    end,
    case
      when coalesce(sum(available_qty), 0) > 0 then null
      else min(pre_order_eta) filter (where supply_status = 'PRE_ORDER')
    end
  into v_total, v_status, v_eta
  from public.product_variant_availability
  where product_id = v_product;

  -- Keep available_qty >= reserved_qty during multi-row edits. The RPCs
  -- validate the true total after all rows have been updated.
  update public.product_availability
  set available_qty = greatest(v_total, reserved_qty),
      supply_status = v_status,
      pre_order_eta = v_eta,
      version = version + 1,
      updated_at = now()
  where product_id = v_product;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists product_variant_availability_sync on public.product_variant_availability;
create trigger product_variant_availability_sync
after insert or update or delete on public.product_variant_availability
for each row execute function public.sync_product_availability_from_variants();

alter table public.product_variant_availability enable row level security;

drop policy if exists product_variant_availability_select on public.product_variant_availability;
create policy product_variant_availability_select on public.product_variant_availability
  for select using (true);

revoke insert, update, delete on public.product_variant_availability from anon, authenticated;
grant select on public.product_variant_availability to anon, authenticated;

create or replace function public.partner_update_variant_availability(
  p_product uuid,
  p_variants jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_variant public.product_variants%rowtype;
  v_before int;
  v_qty int;
  v_status public.supply_status;
  v_eta date;
  v_reserved int;
  v_seen uuid[] := '{}';
  v_total int;
begin
  if auth.uid() is null or not public.is_partner_approved() then
    raise exception 'FORBIDDEN';
  end if;

  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'VALIDATION: variants must be a non-empty array';
  end if;

  perform 1
  from public.products
  where id = p_product and partner_id = auth.uid()
  for update;
  if not found then
    raise exception 'NOT_FOUND: product';
  end if;

  select reserved_qty
  into v_reserved
  from public.product_availability
  where product_id = p_product
  for update;
  if not found then
    raise exception 'NOT_FOUND: product availability';
  end if;

  for v_item in select value from jsonb_array_elements(p_variants) loop
    select *
    into v_variant
    from public.product_variants
    where id = (v_item->>'id')::uuid
      and product_id = p_product;
    if not found then
      raise exception 'VALIDATION: invalid variant';
    end if;
    if v_variant.id = any(v_seen) then
      raise exception 'VALIDATION: duplicate variant';
    end if;
    v_seen := array_append(v_seen, v_variant.id);

    select available_qty
    into v_before
    from public.product_variant_availability
    where variant_id = v_variant.id
    for update;
    v_before := coalesce(v_before, 0);

    v_qty := coalesce((v_item->>'availableQty')::int, 0);
    v_status := coalesce((v_item->>'supplyStatus')::public.supply_status, 'OUT_OF_STOCK');
    v_eta := nullif(v_item->>'preOrderEta', '')::date;

    if v_qty is null or v_qty < 0 then
      raise exception 'VALIDATION: invalid declared quantity';
    end if;
    if v_status = 'PRE_ORDER' and v_eta is null then
      raise exception 'VALIDATION: Pre-order availability date is required';
    end if;
    if v_status = 'OUT_OF_STOCK' and v_qty <> 0 then
      raise exception 'VALIDATION: Out-of-stock quantity must be zero';
    end if;
    if v_status <> 'PRE_ORDER' then
      v_eta := null;
    end if;

    insert into public.product_variant_availability (
      variant_id, product_id, available_qty, supply_status, pre_order_eta, updated_by
    )
    values (
      v_variant.id, p_product, v_qty, v_status, v_eta, auth.uid()
    )
    on conflict (variant_id) do update
    set available_qty = excluded.available_qty,
        supply_status = excluded.supply_status,
        pre_order_eta = excluded.pre_order_eta,
        version = public.product_variant_availability.version + 1,
        updated_by = auth.uid(),
        updated_at = now();

    insert into public.product_availability_history (
      product_id, variant_id, change_type, qty_before, qty_after, ref_type, actor_id
    )
    values (
      p_product, v_variant.id, 'DECLARED', v_before, v_qty, 'PARTNER_DECLARATION', auth.uid()
    );
  end loop;

  select coalesce(sum(available_qty), 0)::int
  into v_total
  from public.product_variant_availability
  where product_id = p_product;

  if v_total < v_reserved then
    raise exception 'INSUFFICIENT_SUPPLY: declared quantity cannot be lower than reserved quantity';
  end if;

  return jsonb_build_object(
    'ok', true,
    'product_id', p_product,
    'available_qty', v_total,
    'reserved_qty', v_reserved
  );
end;
$$;

revoke all on function public.partner_update_variant_availability(uuid, jsonb)
  from public, anon;
grant execute on function public.partner_update_variant_availability(uuid, jsonb)
  to authenticated;

-- A product with variants must be updated through its variants to keep the
-- aggregate consistent. Products without variants keep the old behavior.
create or replace function public.partner_update_product_availability(
  p_product uuid,
  p_available_qty integer,
  p_supply_status public.supply_status,
  p_pre_order_eta date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_availability public.product_availability%rowtype;
begin
  if auth.uid() is null or not public.is_partner_approved() then
    raise exception 'FORBIDDEN';
  end if;

  if p_available_qty is null or p_available_qty < 0 then
    raise exception 'VALIDATION: invalid declared quantity';
  end if;

  if p_supply_status = 'PRE_ORDER' and p_pre_order_eta is null then
    raise exception 'VALIDATION: Pre-order availability date is required';
  end if;

  if p_supply_status = 'OUT_OF_STOCK' and p_available_qty <> 0 then
    raise exception 'VALIDATION: Out-of-stock quantity must be zero';
  end if;

  perform 1
  from public.products
  where id = p_product
    and partner_id = auth.uid()
  for update;
  if not found then
    raise exception 'NOT_FOUND: product';
  end if;

  if exists (select 1 from public.product_variants where product_id = p_product) then
    raise exception 'VALIDATION: update variant quantities instead';
  end if;

  select *
  into v_availability
  from public.product_availability
  where product_id = p_product
  for update;
  if not found then
    raise exception 'NOT_FOUND: product availability';
  end if;

  if p_available_qty < v_availability.reserved_qty then
    raise exception 'INSUFFICIENT_SUPPLY: declared quantity cannot be lower than reserved quantity';
  end if;

  update public.product_availability
  set available_qty = p_available_qty,
      supply_status = p_supply_status,
      pre_order_eta = case when p_supply_status = 'PRE_ORDER' then p_pre_order_eta else null end,
      version = version + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where product_id = p_product;

  insert into public.product_availability_history (
    product_id, change_type, qty_before, qty_after, ref_type, actor_id
  )
  values (
    p_product, 'DECLARED', v_availability.available_qty, p_available_qty,
    'PARTNER_DECLARATION', auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'product_id', p_product,
    'available_qty', p_available_qty,
    'reserved_qty', v_availability.reserved_qty
  );
end;
$$;

revoke all on function public.partner_update_product_availability(uuid, integer, public.supply_status, date)
  from public, anon;
grant execute on function public.partner_update_product_availability(uuid, integer, public.supply_status, date)
  to authenticated;

-- Extend the partner edit RPC so variant availability is saved in the same
-- transaction as the product/variant edit.
create or replace function public.partner_resubmit_product(p_product uuid, p_partner uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_variant jsonb;
  v_variant_id uuid;
  v_before int;
  v_qty int;
  v_status public.supply_status;
  v_eta date;
  v_reserved int;
  v_total int;
begin
  if not exists (select 1 from public.partner_profiles where user_id = p_partner and selling_status = 'APPROVED')
     or not exists (select 1 from public.user_roles where user_id = p_partner and role = 'PARTNER') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_product from public.products where id = p_product and partner_id = p_partner for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not exists (select 1 from public.product_categories where id = (p_data->>'categoryId')::uuid and status = 'ACTIVE') then
    raise exception 'VALIDATION: Vui lòng chọn danh mục đang hoạt động';
  end if;
  for v_variant in select value from jsonb_array_elements(p_data->'variants') loop
    if v_variant->>'id' is not null and not exists (
      select 1 from public.product_variants where id = (v_variant->>'id')::uuid and product_id = p_product
    ) then raise exception 'VALIDATION: Biến thể không thuộc sản phẩm'; end if;
  end loop;

  select reserved_qty into v_reserved
  from public.product_availability
  where product_id = p_product
  for update;
  v_reserved := coalesce(v_reserved, 0);

  if jsonb_array_length(p_data->'variants') = 0
     and v_reserved > 0
     and exists (select 1 from public.product_variants where product_id = p_product) then
    raise exception 'INSUFFICIENT_SUPPLY: cannot remove all variants while orders are reserved';
  end if;

  -- Preserve variant IDs referenced by carts; all failures roll back the entire edit.
  delete from public.product_variants pv where pv.product_id = p_product and not exists (
    select 1 from jsonb_array_elements(p_data->'variants') v where (v->>'id')::uuid = pv.id
  );
  -- Temporarily clear labels to allow swapping labels without unique conflicts.
  update public.product_variants set label = id::text where product_id = p_product;
  for v_variant in select value from jsonb_array_elements(p_data->'variants') loop
    if v_variant->>'id' is null then
      insert into public.product_variants(product_id, label, price)
      values(p_product, v_variant->>'label', (v_variant->>'price')::numeric)
      returning id into v_variant_id;
      v_before := 0;
      v_qty := coalesce((v_variant->>'availableQty')::int, 0);
      v_status := coalesce((v_variant->>'supplyStatus')::public.supply_status,
                           case when v_qty > 0 then 'IN_STOCK'::public.supply_status else 'OUT_OF_STOCK'::public.supply_status end);
      v_eta := nullif(v_variant->>'preOrderEta', '')::date;
    else
      update public.product_variants set label = v_variant->>'label', price = (v_variant->>'price')::numeric
      where id = (v_variant->>'id')::uuid and product_id = p_product
      returning id into v_variant_id;

      select available_qty, supply_status, pre_order_eta
      into v_before, v_status, v_eta
      from public.product_variant_availability
      where variant_id = v_variant_id
      for update;
      v_before := coalesce(v_before, 0);
      v_status := coalesce(v_status, 'OUT_OF_STOCK');
      if v_variant ? 'availableQty' then
        v_qty := (v_variant->>'availableQty')::int;
      else
        v_qty := v_before;
      end if;
      if v_variant ? 'supplyStatus' then
        v_status := (v_variant->>'supplyStatus')::public.supply_status;
      end if;
      if v_variant ? 'preOrderEta' then
        v_eta := nullif(v_variant->>'preOrderEta', '')::date;
      end if;
    end if;

    if v_qty is null or v_qty < 0 then
      raise exception 'VALIDATION: invalid declared quantity';
    end if;
    if v_status = 'PRE_ORDER' and v_eta is null then
      raise exception 'VALIDATION: Pre-order availability date is required';
    end if;
    if v_status = 'OUT_OF_STOCK' and v_qty <> 0 then
      raise exception 'VALIDATION: Out-of-stock quantity must be zero';
    end if;
    if v_status <> 'PRE_ORDER' then
      v_eta := null;
    end if;

    insert into public.product_variant_availability (
      variant_id, product_id, available_qty, supply_status, pre_order_eta, updated_by
    )
    values (v_variant_id, p_product, v_qty, v_status, v_eta, p_partner)
    on conflict (variant_id) do update
    set available_qty = excluded.available_qty,
        supply_status = excluded.supply_status,
        pre_order_eta = excluded.pre_order_eta,
        version = public.product_variant_availability.version + 1,
        updated_by = p_partner,
        updated_at = now();

    insert into public.product_availability_history (
      product_id, variant_id, change_type, qty_before, qty_after, ref_type, actor_id
    )
    values (p_product, v_variant_id, 'DECLARED', v_before, v_qty, 'PARTNER_DECLARATION', p_partner);
  end loop;

  select coalesce(sum(available_qty), 0)::int
  into v_total
  from public.product_variant_availability
  where product_id = p_product;

  if jsonb_array_length(p_data->'variants') > 0 and v_total < v_reserved then
    raise exception 'INSUFFICIENT_SUPPLY: declared quantity cannot be lower than reserved quantity';
  end if;

  delete from public.product_images where product_id = p_product;
  insert into public.product_images(product_id, url, sort_order)
    select p_product, value, (ordinality - 1)::int from jsonb_array_elements_text(p_data->'images') with ordinality;
  update public.products set
    name = p_data->>'name', slug = p_data->>'slug', category_id = (p_data->>'categoryId')::uuid,
    short_description = coalesce(p_data->>'shortDescription', ''), description = coalesce(p_data->>'description', ''),
    price = case when jsonb_array_length(p_data->'variants') > 0 then
      (select min((v->>'price')::numeric) from jsonb_array_elements(p_data->'variants') v)
      else (p_data->>'price')::numeric end,
    ocop_cert_no = nullif(p_data->>'ocopCertNo', ''), reject_reason = null,
    status = 'PENDING', updated_at = now()
  where id = p_product;
end;
$$;

revoke all on function public.partner_resubmit_product(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.partner_resubmit_product(uuid, uuid, jsonb) to service_role;
