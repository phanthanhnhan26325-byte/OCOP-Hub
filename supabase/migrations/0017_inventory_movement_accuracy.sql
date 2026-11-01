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
    returning quantity_on_hand, quantity_on_hand,
      quantity_reserved - v_reserved_delta, quantity_reserved
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

revoke all on function public.sync_central_inventory_reservation() from public, anon, authenticated;
