create or replace function public.sync_pending_payments()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_item record;
  v_availability public.product_availability%rowtype;
  v_order_status public.order_status;
  v_rows integer;
  v_ok integer := 0;
  v_fail integer := 0;
begin
  for v in
    select id, purpose, reference_id
    from public.payments
    where status = 'PAID'
      and business_sync_status = 'PENDING_SYNC'
    for update skip locked
  loop
    begin
      if v.purpose = 'ORDER' then
        select status into v_order_status
        from public.orders
        where id = v.reference_id
        for update;
        if not found then
          raise exception 'ORDER_NOT_FOUND';
        end if;

        update public.orders
        set status = 'PAID',
            updated_at = now()
        where id = v.reference_id
          and status in ('PAYMENT_PENDING', 'CREATED');
        get diagnostics v_rows = row_count;

        if v_rows = 0 and v_order_status <> 'PAID' then
          raise exception 'ORDER_STATE_INVALID';
        end if;

        update public.orders
        set status = 'PENDING_ACCEPTANCE',
            updated_at = now()
        where parent_order_id = v.reference_id
          and status = 'CREATED';

        for v_item in
          select oi.product_id, sum(oi.qty)::integer as qty
          from public.order_items oi
          join public.orders o on o.id = oi.order_id
          where o.parent_order_id = v.reference_id
          group by oi.product_id
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
            product_id, change_type, qty_before, qty_after, ref_type, ref_id
          )
          values (
            v_item.product_id,
            'COMMIT',
            v_availability.available_qty,
            v_availability.available_qty - v_item.qty,
            'ORDER',
            v.reference_id
          );
        end loop;

        insert into public.order_status_history (
          order_id, from_status, to_status, actor_role, reason
        )
        select v.reference_id, v_order_status, 'PAID', 'SYSTEM', 'payment_sync_retry'
        where v_rows > 0;
      elsif v.purpose = 'WORKSHOP_REGISTRATION' then
        update public.workshop_registrations
        set status = 'CONFIRMED',
            hold_expires_at = null,
            updated_at = now()
        where id = v.reference_id
          and status in ('PENDING', 'PAYMENT_PROCESSING');
        get diagnostics v_rows = row_count;

        if v_rows = 0 and not exists (
          select 1
          from public.workshop_registrations
          where id = v.reference_id and status = 'CONFIRMED'
        ) then
          raise exception 'REGISTRATION_STATE_INVALID';
        end if;
      else
        raise exception 'UNSUPPORTED_PAYMENT_PURPOSE:%', v.purpose;
      end if;

      update public.payments
      set business_sync_status = 'SYNCED',
          updated_at = now()
      where id = v.id;
      v_ok := v_ok + 1;
    exception when others then
      v_fail := v_fail + 1;
      insert into public.audit_logs (
        actor_role, action, entity_type, entity_id, after
      )
      values (
        'SYSTEM',
        'PAYMENT_BUSINESS_SYNC_RETRY_FAILED',
        'payment',
        v.id::text,
        jsonb_build_object('error', sqlerrm)
      );
    end;
  end loop;

  return jsonb_build_object('synced', v_ok, 'failed', v_fail);
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

  insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
  values (
    v_product.partner_id,
    case when p_decision = 'APPROVED' then 'product_approved' else 'product_rejected' end,
    case when p_decision = 'APPROVED' then 'Sản phẩm đã được phê duyệt' else 'Sản phẩm chưa được phê duyệt' end,
    case when p_decision = 'APPROVED'
      then 'Sản phẩm "' || v_product.name || '" đã được phê duyệt và có thể hiển thị trên OCOP Hub.'
      else 'Sản phẩm "' || v_product.name || '" bị từ chối. Lý do: ' || v_reason end,
    'product',
    p_product
  );

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'PRODUCT_REVIEW', 'product', p_product::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason)
  );
  return jsonb_build_object('ok', true, 'product_id', p_product, 'decision', p_decision);
end;
$$;

revoke all on function public.sync_pending_payments() from public, anon, authenticated;
grant execute on function public.sync_pending_payments() to service_role;

revoke all on function public.admin_review_product(uuid, uuid, product_status, text) from public, anon, authenticated;
grant execute on function public.admin_review_product(uuid, uuid, product_status, text) to service_role;
