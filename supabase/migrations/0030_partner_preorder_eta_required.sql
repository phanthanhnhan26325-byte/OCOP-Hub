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

  perform 1
  from public.products
  where id = p_product
    and partner_id = auth.uid()
  for update;
  if not found then
    raise exception 'NOT_FOUND: product';
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
    product_id,
    change_type,
    qty_before,
    qty_after,
    ref_type,
    actor_id
  )
  values (
    p_product,
    'DECLARED',
    v_availability.available_qty,
    p_available_qty,
    'PARTNER_DECLARATION',
    auth.uid()
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
