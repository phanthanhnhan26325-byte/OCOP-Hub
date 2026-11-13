with eligible_orders as (
  select child.id,
    round(
      child.subtotal * coalesce(
        (
          select (config.rules->>'rate')::numeric
          from public.fee_config config
          where config.type = 'PLATFORM_RATE'
            and (
              (config.scope = 'PARTNER' and config.partner_id = child.partner_id)
              or (config.scope = 'GLOBAL' and config.partner_id is null)
            )
            and config.effective_from <= child.placed_at
            and (config.effective_to is null or config.effective_to > child.placed_at)
          order by config.scope desc, config.effective_from desc
          limit 1
        ),
        0.10
      ),
      0
    ) as commission
  from public.orders child
  where child.order_level = 'CHILD'
    and child.status in ('DELIVERED', 'COMPLETED', 'RETURNED')
    and child.platform_fee = 0
    and exists (
      select 1
      from public.payments payment
      where payment.purpose = 'ORDER'
        and payment.reference_id = child.parent_order_id
        and payment.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
        and payment.business_sync_status = 'SYNCED'
    )
),
updated_orders as (
  update public.orders child
  set platform_fee = eligible_orders.commission
  from eligible_orders
  where child.id = eligible_orders.id
    and eligible_orders.commission > 0
  returning child.id, child.subtotal, child.platform_fee
)
insert into public.audit_logs (
  actor_role, action, entity_type, entity_id, before, after
)
select 'SYSTEM',
  'PLATFORM_COMMISSION_BACKFILLED',
  'order',
  updated_orders.id::text,
  jsonb_build_object('platform_fee', 0),
  jsonb_build_object(
    'platform_fee', updated_orders.platform_fee,
    'subtotal', updated_orders.subtotal
  )
from updated_orders;

update public.orders parent
set platform_fee = (
  select coalesce(sum(child.platform_fee), 0)
  from public.orders child
  where child.parent_order_id = parent.id
    and child.order_level = 'CHILD'
)
where parent.order_level = 'PARENT'
  and exists (
    select 1
    from public.orders child
    where child.parent_order_id = parent.id
      and child.order_level = 'CHILD'
  );

insert into public.settlement_items (
  statement_id, ref_type, ref_id, amount, direction
)
select refund_item.statement_id,
  'REFUND_COMMISSION',
  refund_item.ref_id,
  least(
    child.platform_fee,
    round(child.platform_fee * refund_item.amount / nullif(child.subtotal, 0), 0)
  ),
  'CREDIT'
from public.settlement_items refund_item
join public.orders child on child.id = refund_item.ref_id
where refund_item.ref_type = 'REFUND'
on conflict (statement_id, ref_type, ref_id)
do update set amount = excluded.amount, direction = excluded.direction;

with recalculated as (
  select statement.id,
    greatest(
      coalesce((
        select sum(child.platform_fee)
        from public.settlement_items sub_order
        join public.orders child on child.id = sub_order.ref_id
        where sub_order.statement_id = statement.id
          and sub_order.ref_type = 'SUB_ORDER'
      ), 0)
      - coalesce((
        select sum(refund_commission.amount)
        from public.settlement_items refund_commission
        where refund_commission.statement_id = statement.id
          and refund_commission.ref_type = 'REFUND_COMMISSION'
      ), 0),
      0
    ) as platform_fee
  from public.settlement_statements statement
),
changes as (
  select statement.id,
    statement.platform_fee as old_platform_fee,
    statement.net_payable as old_net_payable,
    recalculated.platform_fee,
    statement.gross_amount
      - statement.refund_amount
      - recalculated.platform_fee
      + statement.adjustments as net_payable
  from public.settlement_statements statement
  join recalculated on recalculated.id = statement.id
  where statement.platform_fee is distinct from recalculated.platform_fee
),
updated_statements as (
  update public.settlement_statements statement
  set platform_fee = changes.platform_fee,
      net_payable = changes.net_payable
  from changes
  where statement.id = changes.id
  returning statement.id
)
insert into public.audit_logs (
  actor_role, action, entity_type, entity_id, before, after
)
select 'SYSTEM',
  'PLATFORM_COMMISSION_BACKFILLED',
  'settlement',
  changes.id::text,
  jsonb_build_object(
    'platform_fee', changes.old_platform_fee,
    'net_payable', changes.old_net_payable
  ),
  jsonb_build_object(
    'platform_fee', changes.platform_fee,
    'net_payable', changes.net_payable
  )
from changes
join updated_statements on updated_statements.id = changes.id;
