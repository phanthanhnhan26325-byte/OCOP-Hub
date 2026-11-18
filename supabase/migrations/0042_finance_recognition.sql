-- Financial events are shared by reports and settlement generation.
create or replace function public.shipping_for(p_partner uuid, p_subtotal numeric)
returns numeric language sql stable as $$ select 0::numeric $$;

create or replace function public.fee_for(p_partner uuid, p_type text)
returns numeric language sql stable as $$
  select case when p_type = 'PLATFORM_RATE' then 0.10 else coalesce((
    select (config.rules->>'rate')::numeric
    from public.fee_config config
    where config.type = p_type
      and ((config.scope = 'PARTNER' and config.partner_id = p_partner)
        or (config.scope = 'GLOBAL' and config.partner_id is null))
      and config.effective_from <= now()
      and (config.effective_to is null or config.effective_to > now())
    order by config.scope desc, config.effective_from desc
    limit 1
  ), 0) end;
$$;

alter table public.settlement_items
  add column recognized_at timestamptz,
  add column recognized_fee numeric;

create view public.finance_recognition_events as
with settled_sales as (
  select distinct on (item.ref_type, item.ref_id)
    item.ref_type, item.ref_id, item.amount, item.recognized_at, item.recognized_fee, statement.period_start,
    statement.period_end
  from public.settlement_items item
  join public.settlement_statements statement on statement.id = item.statement_id
  where statement.status in ('CONFIRMED', 'PAID')
    and item.ref_type in ('SUB_ORDER', 'WORKSHOP_REGISTRATION')
  order by item.ref_type, item.ref_id, statement.period_end, statement.id
),
order_candidates as (
  select child.id, child.parent_order_id, child.partner_id, child.subtotal,
    child.total,
    coalesce(locked.amount, child.subtotal) as gross,
    case when locked.ref_id is not null then coalesce(locked.recognized_fee, child.platform_fee)
      else round(child.subtotal * 0.10, 0) end as fee,
    case when locked.ref_id is not null then
      coalesce(locked.recognized_at, greatest(child.placed_at, locked.period_start::timestamp at time zone 'Asia/Ho_Chi_Minh'))
    else greatest(payment.paid_at, eligibility.at, return_resolution.at) end as recognized_at
  from public.orders child
  left join settled_sales locked on locked.ref_type = 'SUB_ORDER' and locked.ref_id = child.id
  left join public.order_shipments shipment on shipment.order_id = child.id
  left join lateral (
    select
      min(history.created_at) filter (where history.to_status = 'DELIVERED') as delivered_at,
      min(history.created_at) filter (where history.to_status = 'COMPLETED' and history.actor_role = 'CUSTOMER') as accepted_at
    from public.order_status_history history where history.order_id = child.id
  ) history on true
  cross join lateral (
    select least(
      coalesce(history.accepted_at, case when child.status = 'COMPLETED' then child.updated_at end),
      coalesce(shipment.delivered_at, history.delivered_at) + interval '72 hours'
    ) as at
  ) eligibility
  left join lateral (
    select min(coalesce(transaction.created_at, p.created_at)) as paid_at
    from public.payments p
    left join public.payment_transactions transaction
      on transaction.payment_id = p.id and transaction.type = 'PAYMENT' and transaction.status = 'SUCCESS'
    where p.purpose = 'ORDER' and p.reference_id = child.parent_order_id
      and p.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') and p.business_sync_status = 'SYNCED'
  ) payment on true
  left join lateral (
    select max(request.updated_at) as at
    from public.order_service_requests request
    where request.order_id = child.id and request.request_type = 'RETURN'
      and request.status = 'REJECTED' and request.created_at <= eligibility.at
  ) return_resolution on true
  where child.order_level = 'CHILD'
    and (locked.ref_id is not null or (child.status in ('DELIVERED', 'COMPLETED', 'RETURNED', 'PARTIALLY_REFUNDED')
      and eligibility.at is not null and payment.paid_at is not null
      and not exists (
        select 1 from public.order_service_requests request
        where request.order_id = child.id and request.request_type = 'RETURN'
          and (request.status in ('REQUESTED', 'APPROVED', 'RETURN_SENT')
            or (request.status = 'RETURN_RECEIVED' and (request.refund_status in ('PENDING', 'RESERVED', 'FAILED')
              or request.created_at <= greatest(eligibility.at, payment.paid_at))))
      )))
),
orders_recognized as (
  select * from order_candidates where recognized_at <= now()
),
workshops_recognized as (
  select registration.id, workshop.partner_id,
    coalesce(locked.amount, registration.amount) as gross,
    case when locked.ref_id is not null then coalesce(locked.recognized_fee, registration.platform_fee)
      else round(registration.amount * 0.10, 0) end as fee,
    case when locked.ref_id is not null then coalesce(locked.recognized_at, greatest(registration.created_at,
      locked.period_start::timestamp at time zone 'Asia/Ho_Chi_Minh'))
      else payment.paid_at end as recognized_at
  from public.workshop_registrations registration
  join public.workshop_sessions session on session.id = registration.session_id
  join public.workshops workshop on workshop.id = session.workshop_id
  left join settled_sales locked on locked.ref_type = 'WORKSHOP_REGISTRATION' and locked.ref_id = registration.id
  left join lateral (
    select min(coalesce(transaction.created_at, p.created_at)) as paid_at
    from public.payments p
    left join public.payment_transactions transaction
      on transaction.payment_id = p.id and transaction.type = 'PAYMENT' and transaction.status = 'SUCCESS'
    where p.purpose = 'WORKSHOP_REGISTRATION' and p.reference_id = registration.id
      and p.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') and p.business_sync_status = 'SYNCED'
  ) payment on true
  where locked.ref_id is not null or (payment.paid_at <= now()
    and registration.status in ('CONFIRMED', 'COMPLETED', 'REFUNDED'))
),
-- A legacy partial refund on a multi-partner parent lacks a safe allocation.
refund_candidates as (
  select refund.id, sale.id as sale_id, sale.partner_id, sale.gross, sale.fee,
    greatest(coalesce(refund.confirmed_at, refund.created_at), sale.recognized_at) as recognized_at,
    case when refund.ref_id = sale.id and refund.amount >= sale.total then sale.gross
      when refund.ref_id = sale.id then least(refund.amount, sale.gross)
      when refund.amount >= parent.total then sale.gross
      else least(refund.amount, sale.gross) end as amount
  from public.refunds refund
  join public.payments payment on payment.id = refund.payment_id and payment.purpose = 'ORDER'
  join public.orders parent on parent.id = payment.reference_id
  join orders_recognized sale on sale.parent_order_id = parent.id
    and (refund.ref_id = sale.id or (refund.ref_id = parent.id and (
      refund.amount >= parent.total or not exists (
        select 1 from public.orders sibling
        where sibling.parent_order_id = parent.id and sibling.id <> sale.id
      )
    )))
  where refund.status = 'COMPLETED'
  union all
  select refund.id, sale.id, sale.partner_id, sale.gross, sale.fee,
    greatest(coalesce(refund.confirmed_at, refund.created_at), sale.recognized_at),
    least(refund.amount, sale.gross)
  from public.refunds refund
  join public.payments payment on payment.id = refund.payment_id and payment.purpose = 'WORKSHOP_REGISTRATION'
  join workshops_recognized sale on sale.id = payment.reference_id
  where refund.status = 'COMPLETED'
),
refund_running as (
  select candidate.*,
    sum(amount) over (partition by sale_id order by recognized_at, id) as running_amount
  from refund_candidates candidate
),
refund_events as (
  select refund.id, refund.sale_id, refund.partner_id, refund.recognized_at,
    least(refund.gross, refund.running_amount) - least(refund.gross, refund.running_amount - refund.amount) as amount,
    least(refund.fee, round(least(refund.gross, refund.running_amount) * 0.10, 0))
      - least(refund.fee, round(least(refund.gross, refund.running_amount - refund.amount) * 0.10, 0)) as fee
  from refund_running refund
)
select 'SUB_ORDER'::text as ref_type, sale.id as ref_id, sale.id as sale_id, sale.partner_id,
  sale.recognized_at, sale.gross, 0::numeric as refund, sale.fee
from orders_recognized sale
union all
select 'WORKSHOP_REGISTRATION', sale.id, sale.id, sale.partner_id, sale.recognized_at, sale.gross, 0, sale.fee
from workshops_recognized sale
union all
select case when product.id is null then 'WORKSHOP_REFUND' else 'REFUND' end,
  event.id, event.sale_id, event.partner_id, event.recognized_at, 0, event.amount, -event.fee
from refund_events event
left join orders_recognized product on product.id = event.sale_id
where event.amount > 0;

revoke all on public.finance_recognition_events from public, anon, authenticated;
grant select on public.finance_recognition_events to service_role;

create or replace function public.generate_settlement(p_partner uuid, p_start date, p_end date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statement public.settlement_statements%rowtype;
  v_start timestamptz := p_start::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_end timestamptz := (p_end + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_gross numeric;
  v_refund numeric;
  v_fee numeric;
  v_adjustments numeric;
  v_recoveries numeric := 0;
  v_carried numeric := 0;
  v_net numeric;
  v_recovery record;
  v_applied numeric;
begin
  if p_start is null or p_end is null
    or p_start <> date_trunc('month', p_start)::date
    or p_end <> (p_start + interval '1 month - 1 day')::date
    or not exists (select 1 from public.partner_profiles where user_id = p_partner) then
    raise exception 'VALIDATION: choose a valid partner and complete calendar month';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('settlement:' || p_partner::text, 0));
  insert into public.settlement_statements (partner_id, period_start, period_end)
  values (p_partner, p_start, p_end)
  on conflict (partner_id, period_start, period_end) do nothing;

  select * into strict v_statement
  from public.settlement_statements
  where partner_id = p_partner and period_start = p_start and period_end = p_end
  for update;

  if v_statement.status <> 'DRAFT' then
    return jsonb_build_object('statement_id', v_statement.id, 'exists', true);
  end if;

  delete from public.settlement_items where statement_id = v_statement.id;

  -- Materialize the period once so the item rows and statement totals agree.
  with period_events as materialized (
    select event.*
    from public.finance_recognition_events event
    where event.partner_id = p_partner and event.recognized_at >= v_start and event.recognized_at < v_end
      and not exists (
        select 1 from public.settlement_items item
        join public.settlement_statements prior on prior.id = item.statement_id
        where prior.partner_id = p_partner and prior.status in ('CONFIRMED', 'PAID')
          and item.ref_id = event.ref_id and item.ref_type = event.ref_type
      )
      and not (event.ref_type in ('REFUND', 'WORKSHOP_REFUND') and exists (
        select 1 from public.partner_recoveries recovery
        where recovery.partner_id = p_partner and recovery.refund_id = event.ref_id
      ))
  ), items as (
    select event.ref_type, event.ref_id, sum(event.gross + event.refund) as amount,
      case when sum(event.refund) > 0 then 'DEBIT' else 'CREDIT' end as direction,
      min(event.recognized_at) as recognized_at, sum(event.fee) as recognized_fee
    from period_events event group by event.ref_type, event.ref_id
    union all
    select 'REFUND_COMMISSION', event.ref_id, -sum(event.fee), 'CREDIT', min(event.recognized_at), null
    from period_events event where event.refund > 0 group by event.ref_id
    having sum(event.fee) < 0
  ), inserted as (
    insert into public.settlement_items (statement_id, ref_type, ref_id, amount, direction, recognized_at, recognized_fee)
    select v_statement.id, item.ref_type, item.ref_id, item.amount, item.direction, item.recognized_at, item.recognized_fee
    from items item
  )
  select coalesce(sum(gross), 0), coalesce(sum(refund), 0), coalesce(sum(fee), 0)
  into v_gross, v_refund, v_fee from period_events;

  insert into public.settlement_items (statement_id, ref_type, ref_id, amount, direction)
  select v_statement.id, 'ADJUSTMENT', adjustment.id, abs(adjustment.amount),
    case when adjustment.amount < 0 then 'DEBIT' else 'CREDIT' end
  from public.adjustments adjustment
  where adjustment.partner_id = p_partner and adjustment.created_at >= v_start and adjustment.created_at < v_end;

  select coalesce(sum(case when direction = 'DEBIT' then -amount else amount end), 0)
  into v_adjustments from public.settlement_items
  where statement_id = v_statement.id and ref_type = 'ADJUSTMENT';

  v_net := v_gross - v_refund - v_fee + v_adjustments;
  for v_recovery in
    select recovery.id, recovery.amount - recovery.recovered_amount - coalesce((
      select sum(item.amount) from public.settlement_items item
      join public.settlement_statements draft on draft.id = item.statement_id
      where item.ref_type = 'RECOVERY' and item.ref_id = recovery.id and draft.status = 'DRAFT'
    ), 0) as remaining
    from public.partner_recoveries recovery
    where recovery.partner_id = p_partner and recovery.amount > recovery.recovered_amount
    order by recovery.created_at, recovery.id for update
  loop
    exit when v_net <= 0;
    v_applied := least(v_net, v_recovery.remaining);
    if v_applied > 0 then
      insert into public.settlement_items (statement_id, ref_type, ref_id, amount, direction)
      values (v_statement.id, 'RECOVERY', v_recovery.id, v_applied, 'DEBIT');
      v_recoveries := v_recoveries + v_applied;
      v_net := v_net - v_applied;
    end if;
  end loop;

  for v_recovery in
    select prior.id, -prior.net_payable - coalesce((
      select sum(item.amount)
      from public.settlement_items item
      where item.ref_type = 'REFUND_BALANCE' and item.ref_id = prior.id
    ), 0) as remaining
    from public.settlement_statements prior
    where prior.partner_id = p_partner and prior.status in ('CONFIRMED', 'PAID')
      and prior.net_payable < 0 and prior.period_end < p_start
    order by prior.period_end, prior.id
  loop
    exit when v_net <= 0;
    v_applied := least(v_net, v_recovery.remaining);
    if v_applied > 0 then
      insert into public.settlement_items (statement_id, ref_type, ref_id, amount, direction)
      values (v_statement.id, 'REFUND_BALANCE', v_recovery.id, v_applied, 'DEBIT');
      v_carried := v_carried + v_applied;
      v_net := v_net - v_applied;
    end if;
  end loop;

  update public.settlement_statements
  set gross_amount = v_gross, refund_amount = v_refund, platform_fee = v_fee,
    adjustments = v_adjustments - v_recoveries - v_carried, net_payable = v_net
  where id = v_statement.id;

  return jsonb_build_object('statement_id', v_statement.id, 'gross', v_gross,
    'refund', v_refund, 'platform_fee', v_fee, 'adjustments', v_adjustments,
    'recoveries', v_recoveries, 'refund_balance_applied', v_carried, 'net', v_net);
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
  where id = p_statement;
  if not found then
    raise exception 'NOT_FOUND: settlement';
  end if;
  if v_statement.status <> 'DRAFT' then
    raise exception 'INVALID_STATE: settlement is not a draft';
  end if;

  if v_statement.period_end >= (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'INVALID_STATE: settlement period has not closed';
  end if;
  perform public.generate_settlement(v_statement.partner_id, v_statement.period_start, v_statement.period_end);
  select * into strict v_statement from public.settlement_statements where id = p_statement for update;
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

create or replace function public.admin_review_settlement_request(
  p_admin uuid,
  p_request uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.settlement_requests%rowtype;
  v_statement public.settlement_statements%rowtype;
  v_due numeric;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('APPROVE', 'REJECT')
     or (p_decision = 'REJECT' and length(coalesce(v_reason, '')) < 3) then
    raise exception 'VALIDATION: invalid settlement request decision';
  end if;

  select * into v_request
  from public.settlement_requests
  where id = p_request
  for update;
  if not found then
    raise exception 'NOT_FOUND: settlement request';
  end if;
  if v_request.status <> 'REQUESTED' then
    raise exception 'INVALID_STATE: settlement request has already been reviewed';
  end if;

  select * into v_statement
  from public.settlement_statements
  where id = v_request.statement_id;
  if not found or v_statement.partner_id <> v_request.partner_id then
    raise exception 'NOT_FOUND: settlement statement';
  end if;

  if p_decision = 'APPROVE' then
    if v_statement.status = 'DRAFT' then
      perform public.admin_confirm_settlement(p_admin, v_statement.id);
      select * into strict v_statement from public.settlement_statements where id = v_statement.id;
    elsif v_statement.status <> 'CONFIRMED' then
      raise exception 'INVALID_STATE: settlement is not payable';
    end if;
    select v_statement.net_payable - coalesce(sum(payout.amount), 0) into v_due
    from public.payouts payout where payout.statement_id = v_statement.id;
    if v_due <= 0 then
      raise exception 'INVALID_STATE: settlement has no remaining payable balance';
    end if;
    update public.settlement_requests
    set requested_amount = v_due, status = 'APPROVED', reviewed_at = now(), reviewed_by = p_admin, rejection_reason = null
    where id = p_request;
  else
    update public.settlement_requests
    set status = 'REJECTED', reviewed_at = now(), reviewed_by = p_admin, rejection_reason = v_reason
    where id = p_request;
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_admin, 'ADMIN', 'SETTLEMENT_REQUEST_REVIEWED', 'settlement_request', p_request::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason, 'statement_id', v_statement.id)
  );

  return jsonb_build_object('ok', true, 'request_id', p_request, 'status', case when p_decision = 'APPROVE' then 'APPROVED' else 'REJECTED' end);
end;
$$;

create or replace function public.admin_record_manual_refund(
  p_admin uuid,
  p_payment uuid,
  p_amount numeric,
  p_reason text,
  p_transfer_reference text,
  p_child_order uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_refund_id uuid;
  v_reference text := nullif(trim(coalesce(p_transfer_reference, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_refunded numeric;
  v_child_total numeric;
  v_child_refunded numeric;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount is null
     or p_amount <= 0
     or p_amount <> trunc(p_amount)
     or length(coalesce(v_reason, '')) < 3
     or length(coalesce(v_reference, '')) < 3 then
    raise exception 'VALIDATION: invalid manual refund';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment
  for update;
  if not found then
    raise exception 'NOT_FOUND: payment';
  end if;
  if v_payment.status not in ('PAID', 'PARTIALLY_REFUNDED')
     or v_payment.business_sync_status <> 'SYNCED' then
    raise exception 'INVALID_STATE: payment is not eligible for refund';
  end if;

  if p_child_order is not null then
    select child.total into v_child_total
    from public.orders child
    where v_payment.purpose = 'ORDER' and child.id = p_child_order
      and child.parent_order_id = v_payment.reference_id and child.order_level = 'CHILD';
    if not found then
      raise exception 'VALIDATION: invalid child order for refund';
    end if;
    select coalesce(sum(refund.amount), 0) into v_child_refunded
    from public.refunds refund
    where refund.payment_id = v_payment.id and refund.ref_id = p_child_order and refund.status = 'COMPLETED';
    if v_child_refunded + p_amount > v_child_total then
      raise exception 'AMOUNT_EXCEEDS: refund exceeds child order amount';
    end if;
  elsif v_payment.purpose = 'ORDER' and p_amount < v_payment.amount and (
    select count(*) from public.orders child
    where child.parent_order_id = v_payment.reference_id and child.order_level = 'CHILD'
  ) > 1 then
    raise exception 'VALIDATION: choose a child order for a partial refund';
  end if;

  v_refunded := v_payment.refunded_amount + p_amount;
  if v_refunded > v_payment.amount then
    raise exception 'AMOUNT_EXCEEDS';
  end if;

  insert into public.refunds (
    payment_id, ref_type, ref_id, amount, reason, status,
    provider_refund_id, requested_by, confirmed_at, updated_at
  )
  values (
    v_payment.id, v_payment.purpose::text, coalesce(p_child_order, v_payment.reference_id),
    p_amount, v_reason, 'COMPLETED',
    'MANUAL:' || v_payment.id::text || ':' || v_reference,
    p_admin, now(), now()
  )
  returning id into v_refund_id;

  insert into public.payment_transactions (
    payment_id, type, provider, provider_txn_id, amount, status, response
  )
  values (
    v_payment.id, 'REFUND', 'MANUAL',
    'MANUAL:' || v_payment.id::text || ':' || v_reference,
    p_amount, 'SUCCESS',
    jsonb_build_object('transfer_reference', v_reference, 'recorded_by', p_admin)
  );

  update public.payments
  set refunded_amount = v_refunded,
      status = case when v_refunded = amount then 'REFUNDED'::payment_status else 'PARTIALLY_REFUNDED'::payment_status end,
      updated_at = now()
  where id = v_payment.id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'MANUAL_REFUND_RECORDED', 'payment', v_payment.id::text,
    jsonb_build_object(
      'refund_id', v_refund_id,
      'amount', p_amount,
      'transfer_reference', v_reference,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'refund_id', v_refund_id,
    'refunded_total', v_refunded,
    'remaining', v_payment.amount - v_refunded
  );
end;
$$;

revoke all on function public.admin_record_manual_refund(uuid, uuid, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_record_manual_refund(uuid, uuid, numeric, text, text, uuid) to service_role;

create or replace function public.admin_record_manual_refund(
  p_admin uuid, p_payment uuid, p_amount numeric, p_reason text, p_transfer_reference text
)
returns jsonb language sql security definer set search_path = public as $$
  select public.admin_record_manual_refund(p_admin, p_payment, p_amount, p_reason, p_transfer_reference, null::uuid);
$$;

create or replace function public.admin_record_order_return_refund(
  p_admin uuid,
  p_order uuid,
  p_amount numeric,
  p_reason text,
  p_received_via text,
  p_transfer_reference text,
  p_child_order uuid
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
  if p_child_order is not null then
    select child.status::text into v_effective_status from public.orders child
    where child.id = p_child_order and child.parent_order_id = p_order;
  end if;
  if v_effective_status is null
     or v_effective_status not in ('DELIVERED', 'COMPLETED', 'PARTIALLY_REFUNDED', 'RETURNED') then
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
    p_admin, v_payment_id, p_amount, v_reason, v_reference, p_child_order
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
revoke all on function public.admin_record_order_return_refund(uuid, uuid, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_record_order_return_refund(uuid, uuid, numeric, text, text, text, uuid) to service_role;

create or replace function public.admin_record_order_return_refund(
  p_admin uuid, p_order uuid, p_amount numeric, p_reason text, p_received_via text, p_transfer_reference text
)
returns jsonb language sql security definer set search_path = public as $$
  select public.admin_record_order_return_refund(p_admin, p_order, p_amount, p_reason, p_received_via, p_transfer_reference, null::uuid);
$$;

-- New refunds are recorded on the actual order in the refund period. Historical
-- recovery allocations already recorded in prior periods remain available.
drop trigger refunds_create_partner_recoveries_insert on public.refunds;
drop trigger refunds_create_partner_recoveries_update on public.refunds;

create policy order_shipments_customer_select on public.order_shipments
  for select to authenticated
  using (exists (
    select 1 from public.orders orders where orders.id = order_id and orders.customer_id = auth.uid()
  ));

create function public.enforce_order_return_deadline()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_delivered_at timestamptz;
begin
  select coalesce(
    (select shipment.delivered_at from public.order_shipments shipment where shipment.order_id = new.order_id),
    (select min(history.created_at) from public.order_status_history history
      where history.order_id = new.order_id and history.to_status = 'DELIVERED')
  ) into v_delivered_at;
  if v_delivered_at is null or now() >= v_delivered_at + interval '72 hours' then
    raise exception 'VALIDATION: Đơn đã hết thời hạn yêu cầu trả hàng hoặc chưa có thời điểm giao hàng.';
  end if;
  return new;
end;
$$;

create trigger order_service_requests_return_deadline
  before insert on public.order_service_requests
  for each row when (new.request_type = 'RETURN')
  execute function public.enforce_order_return_deadline();

do $$
declare
  draft record;
begin
  for draft in
    select partner_id, period_start, period_end from public.settlement_statements
    where status = 'DRAFT' order by partner_id, period_start
  loop
    perform public.generate_settlement(draft.partner_id, draft.period_start, draft.period_end);
  end loop;
end;
$$;

create or replace function public.partner_request_settlement(
  p_partner uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_statement uuid;
  v_net numeric;
  v_paid numeric;
  v_request uuid;
  v_bank public.partner_payout_accounts%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_partner
     or not exists (
       select 1 from public.partner_profiles
       where user_id = p_partner and selling_status = 'APPROVED'
     ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_start is null
     or p_end is null
     or p_start <> date_trunc('month', p_start)::date
     or p_end <> (p_start + interval '1 month - 1 day')::date
     or p_end >= date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'VALIDATION: settlement requests are available for closed calendar months only';
  end if;

  select * into v_bank
  from public.partner_payout_accounts
  where partner_id = p_partner;
  if not found then
    raise exception 'PAYOUT_ACCOUNT_REQUIRED';
  end if;

  v_result := public.generate_settlement(p_partner, p_start, p_end);
  v_statement := (v_result->>'statement_id')::uuid;

  select net_payable into v_net
  from public.settlement_statements
  where id = v_statement and partner_id = p_partner
  for update;
  if not found or v_net <= 0 then
    raise exception 'NO_SETTLEMENT_AMOUNT';
  end if;
  select coalesce(sum(amount), 0) into v_paid
  from public.payouts
  where statement_id = v_statement;
  v_net := v_net - v_paid;
  if v_net <= 0 then
    raise exception 'SETTLEMENT_ALREADY_PAID';
  end if;
  if exists (
    select 1 from public.settlement_requests
    where statement_id = v_statement and status in ('REQUESTED', 'APPROVED')
  ) then
    raise exception 'SETTLEMENT_REQUEST_ALREADY_EXISTS';
  end if;

  insert into public.settlement_requests (
    statement_id, partner_id, requested_amount,
    bank_name, account_holder, account_number
  )
  values (
    v_statement, p_partner, v_net,
    trim(v_bank.bank_name), trim(v_bank.account_holder), trim(v_bank.account_number)
  )
  returning id into v_request;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_partner, 'PARTNER', 'SETTLEMENT_REQUESTED', 'settlement_request', v_request::text,
    jsonb_build_object(
      'statement_id', v_statement,
      'period_start', p_start,
      'period_end', p_end,
      'gross_amount', (select gross_amount from public.settlement_statements where id = v_statement),
      'platform_fee', (select platform_fee from public.settlement_statements where id = v_statement),
      'requested_amount', v_net
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request,
    'statement_id', v_statement,
    'requested_amount', v_net
  );
end;
$$;
