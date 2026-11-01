-- Partner-declared quantities are not physical central-warehouse stock.
-- Do not migrate while active reservations exist; let payment holds expire first.
do $$
begin
  if exists (
    select 1
    from public.product_availability
    where reserved_qty > 0
  ) then
    raise exception 'CENTRAL_INVENTORY_MIGRATION_BLOCKED: expire or resolve reserved orders before applying';
  end if;
end;
$$;

alter table public.product_availability
  add column if not exists legacy_partner_declared_qty integer not null default 0;

create table public.inventory_balances (
  product_id uuid primary key references public.products(id) on delete cascade,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  version integer not null default 0,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  constraint ck_inventory_reserved_le_on_hand check (quantity_on_hand >= quantity_reserved)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (
    movement_type in ('RECEIPT', 'ISSUE', 'ADJUSTMENT', 'ORDER_RESERVED', 'ORDER_RELEASED', 'ORDER_COMMITTED')
  ),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reserved_before integer not null check (reserved_before >= 0),
  reserved_after integer not null check (reserved_after >= 0),
  reason text not null default '',
  ref_type text,
  ref_id uuid,
  actor_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint ck_inventory_movement_reserved_before check (reserved_before <= quantity_before),
  constraint ck_inventory_movement_reserved_after check (reserved_after <= quantity_after)
);

create index idx_inventory_movements_product on public.inventory_movements(product_id, created_at desc);
create index idx_inventory_movements_actor on public.inventory_movements(actor_id, created_at desc);

alter table public.inventory_balances enable row level security;
alter table public.inventory_movements enable row level security;

create policy inventory_balances_select_admin on public.inventory_balances for select
  using (public.is_admin());
create policy inventory_movements_select_admin on public.inventory_movements for select
  using (public.is_admin());

revoke insert, update, delete on public.inventory_balances from authenticated;
revoke insert, update, delete on public.inventory_movements from authenticated;

drop policy if exists availability_insert_partner on public.product_availability;
drop policy if exists availability_update on public.product_availability;
revoke insert, update, delete on public.product_availability from authenticated;

update public.product_availability
set legacy_partner_declared_qty = available_qty,
    available_qty = 0,
    reserved_qty = 0,
    supply_status = 'OUT_OF_STOCK',
    pre_order_eta = null,
    version = version + 1,
    updated_at = now();

insert into public.product_availability (product_id, available_qty, reserved_qty, supply_status)
select p.id, 0, 0, 'OUT_OF_STOCK'
from public.products p
where not exists (
  select 1 from public.product_availability a where a.product_id = p.id
);

insert into public.inventory_balances (product_id, quantity_on_hand, quantity_reserved)
select p.id, 0, 0
from public.products p
on conflict (product_id) do nothing;

create or replace function public.sync_central_inventory_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved_delta integer := new.reserved_qty - old.reserved_qty;
  v_committed integer := greatest(old.available_qty - new.available_qty, 0);
  v_quantity_before integer;
  v_quantity_after integer;
  v_reserved_before integer;
  v_reserved_after integer;
begin
  if v_reserved_delta = 0 then
    return new;
  end if;

  if v_reserved_delta > 0 then
    update public.inventory_balances
    set quantity_reserved = quantity_reserved + v_reserved_delta,
        version = version + 1,
        updated_at = now()
    where product_id = new.product_id
      and quantity_on_hand - quantity_reserved >= v_reserved_delta
    returning quantity_on_hand, quantity_on_hand, quantity_reserved - v_reserved_delta, quantity_reserved
    into v_quantity_before, v_quantity_after, v_reserved_before, v_reserved_after;
    if not found then
      raise exception 'INSUFFICIENT_CENTRAL_STOCK:%', new.product_id;
    end if;
  else
    if v_committed > -v_reserved_delta then
      raise exception 'INVALID_INVENTORY_TRANSITION:%', new.product_id;
    end if;

    update public.inventory_balances
    set quantity_on_hand = quantity_on_hand - v_committed,
        quantity_reserved = quantity_reserved + v_reserved_delta,
        version = version + 1,
        updated_at = now()
    where product_id = new.product_id
      and quantity_on_hand >= v_committed
      and quantity_reserved >= -v_reserved_delta
    returning quantity_on_hand + v_committed, quantity_on_hand,
      quantity_reserved - v_reserved_delta, quantity_reserved
    into v_quantity_before, v_quantity_after, v_reserved_before, v_reserved_after;
    if not found then
      raise exception 'INVALID_INVENTORY_TRANSITION:%', new.product_id;
    end if;
  end if;

  insert into public.inventory_movements (
    product_id, movement_type, quantity_before, quantity_after,
    reserved_before, reserved_after, reason, ref_type, ref_id, actor_id
  )
  values (
    new.product_id,
    case when v_reserved_delta > 0 then 'ORDER_RESERVED'
      when v_committed > 0 then 'ORDER_COMMITTED'
      else 'ORDER_RELEASED' end,
    v_quantity_before,
    v_quantity_after,
    v_reserved_before,
    v_reserved_after,
    'Cập nhật giữ chỗ đơn hàng',
    'ORDER',
    null,
    auth.uid()
  );
  return new;
end;
$$;

create trigger product_availability_central_inventory
  after update of available_qty, reserved_qty on public.product_availability
  for each row
  when (new.available_qty is distinct from old.available_qty or new.reserved_qty is distinct from old.reserved_qty)
  execute function public.sync_central_inventory_reservation();

revoke all on function public.sync_central_inventory_reservation() from public, anon, authenticated;

create or replace function public.admin_record_inventory_movement(
  p_admin uuid,
  p_product uuid,
  p_operation text,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_availability public.product_availability%rowtype;
  v_balance public.inventory_balances%rowtype;
  v_delta integer;
  v_new_quantity integer;
  v_movement uuid;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_operation is null
     or p_operation not in ('RECEIPT', 'ISSUE', 'ADJUSTMENT')
     or p_quantity is null or p_quantity < 0
     or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'VALIDATION: invalid inventory movement';
  end if;

  select * into v_availability
  from public.product_availability
  where product_id = p_product
  for update;
  if not found then
    raise exception 'NOT_FOUND: product availability';
  end if;

  select * into v_balance
  from public.inventory_balances
  where product_id = p_product
  for update;
  if not found then
    raise exception 'NOT_FOUND: inventory balance';
  end if;

  if p_operation = 'RECEIPT' then
    if p_quantity = 0 then
      raise exception 'VALIDATION: receipt quantity must be positive';
    end if;
    v_delta := p_quantity;
  elsif p_operation = 'ISSUE' then
    if p_quantity = 0 then
      raise exception 'VALIDATION: issue quantity must be positive';
    end if;
    v_delta := -p_quantity;
  else
    v_delta := p_quantity - v_balance.quantity_on_hand;
  end if;

  v_new_quantity := v_balance.quantity_on_hand + v_delta;
  if v_new_quantity < v_balance.quantity_reserved then
    raise exception 'INSUFFICIENT_CENTRAL_STOCK:%', p_product;
  end if;
  if v_delta = 0 then
    raise exception 'INVALID_STATE: inventory quantity is unchanged';
  end if;

  update public.inventory_balances
  set quantity_on_hand = v_new_quantity,
      version = version + 1,
      updated_by = p_admin,
      updated_at = now()
  where product_id = p_product;

  update public.product_availability
  set available_qty = v_new_quantity,
      reserved_qty = v_balance.quantity_reserved,
      supply_status = case when v_new_quantity > v_balance.quantity_reserved then 'IN_STOCK'::supply_status else 'OUT_OF_STOCK'::supply_status end,
      pre_order_eta = null,
      version = version + 1,
      updated_by = p_admin,
      updated_at = now()
  where product_id = p_product;

  insert into public.inventory_movements (
    product_id, movement_type, quantity_before, quantity_after,
    reserved_before, reserved_after, reason, actor_id
  )
  values (
    p_product, p_operation, v_balance.quantity_on_hand, v_new_quantity,
    v_balance.quantity_reserved, v_balance.quantity_reserved, trim(p_reason), p_admin
  )
  returning id into v_movement;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'INVENTORY_MOVEMENT', 'product', p_product::text,
    jsonb_build_object('movement_id', v_movement, 'operation', p_operation, 'quantity', p_quantity, 'reason', p_reason)
  );

  return jsonb_build_object(
    'ok', true,
    'movement_id', v_movement,
    'quantity_on_hand', v_new_quantity,
    'quantity_reserved', v_balance.quantity_reserved
  );
end;
$$;

revoke all on function public.admin_record_inventory_movement(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.admin_record_inventory_movement(uuid, uuid, text, integer, text) to service_role;
