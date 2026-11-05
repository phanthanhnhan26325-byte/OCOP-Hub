create table public.financial_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_type text not null check (expense_type in ('SHIPPING', 'OPERATING')),
  description text not null,
  amount numeric(14, 0) not null check (amount > 0),
  incurred_at timestamptz not null,
  reference_code text,
  recorded_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint ck_financial_expense_description check (length(trim(description)) between 3 and 500)
);

create index idx_financial_expenses_incurred on public.financial_expenses(incurred_at desc);
alter table public.financial_expenses enable row level security;
create policy financial_expenses_admin_select on public.financial_expenses
  for select using (public.is_admin());

create table public.partner_recoveries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  refund_id uuid not null references public.refunds(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(14, 0) not null check (amount > 0),
  recovered_amount numeric(14, 0) not null default 0,
  created_at timestamptz not null default now(),
  constraint ck_partner_recovery_amount check (
    recovered_amount >= 0 and recovered_amount <= amount
  ),
  unique (refund_id, order_id)
);

create index idx_partner_recoveries_partner on public.partner_recoveries(partner_id, created_at desc);
alter table public.partner_recoveries enable row level security;
create policy partner_recoveries_admin_select on public.partner_recoveries
  for select using (public.is_admin());

create or replace function public.admin_record_financial_expense(
  p_admin uuid,
  p_expense_type text,
  p_description text,
  p_amount numeric,
  p_incurred_at timestamptz,
  p_reference_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_reference text := nullif(trim(coalesce(p_reference_code, '')), '');
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_expense_type is null
     or p_expense_type not in ('SHIPPING', 'OPERATING')
     or v_description is null
     or length(v_description) < 3
     or p_amount is null
     or p_amount <= 0
     or p_amount <> trunc(p_amount)
     or p_incurred_at is null then
    raise exception 'VALIDATION: invalid financial expense';
  end if;

  insert into public.financial_expenses (
    expense_type, description, amount, incurred_at, reference_code, recorded_by
  )
  values (
    p_expense_type, v_description, p_amount, p_incurred_at, v_reference, p_admin
  )
  returning id into v_id;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_admin, 'ADMIN', 'FINANCIAL_EXPENSE_RECORDED', 'financial_expense', v_id::text,
    jsonb_build_object(
      'expense_type', p_expense_type,
      'description', v_description,
      'amount', p_amount,
      'incurred_at', p_incurred_at,
      'reference_code', v_reference
    )
  );

  return jsonb_build_object('ok', true, 'expense_id', v_id);
end;
$$;

create or replace function public.record_partner_recovery_for_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_order uuid;
  v_parent_total numeric;
  v_child record;
  v_refund_share numeric;
  v_paid_share numeric;
  v_recovery numeric;
  v_remaining numeric;
begin
  if new.status <> 'COMPLETED' then
    return new;
  end if;

  select p.reference_id into v_parent_order
  from public.payments p
  where p.id = new.payment_id
    and p.purpose = 'ORDER';
  if v_parent_order is null then
    return new;
  end if;

  select coalesce(sum(o.subtotal), 0) into v_parent_total
  from public.orders o
  where o.parent_order_id = v_parent_order
    and o.order_level = 'CHILD';
  if v_parent_total <= 0 then
    return new;
  end if;

  v_remaining := new.amount;
  for v_child in
    select o.id, o.partner_id, o.subtotal, o.platform_fee
    from public.orders o
    where o.parent_order_id = v_parent_order
      and o.order_level = 'CHILD'
    order by o.id
  loop
    select coalesce(sum(
      payout.amount * item.amount / nullif(statement.gross_amount, 0)
    ), 0)
    into v_paid_share
    from public.settlement_items item
    join public.settlement_statements statement on statement.id = item.statement_id
    join public.payouts payout on payout.statement_id = statement.id
    where item.ref_type = 'SUB_ORDER'
      and item.ref_id = v_child.id
      and statement.partner_id = v_child.partner_id
      and statement.gross_amount > 0;

    v_refund_share := least(
      v_remaining,
      round(new.amount * v_child.subtotal / v_parent_total, 0)
    );
    v_recovery := least(
      v_refund_share,
      v_paid_share,
      greatest(v_child.subtotal - v_child.platform_fee, 0)
    );

    if v_recovery > 0 then
      insert into public.partner_recoveries (
        partner_id, refund_id, order_id, amount
      )
      values (
        v_child.partner_id, new.id, v_child.id, v_recovery
      )
      on conflict (refund_id, order_id) do nothing;
    end if;

    v_remaining := greatest(v_remaining - v_refund_share, 0);
  end loop;

  return new;
end;
$$;

create trigger refunds_create_partner_recoveries_insert
  after insert on public.refunds
  for each row
  when (new.status = 'COMPLETED')
  execute function public.record_partner_recovery_for_refund();

create trigger refunds_create_partner_recoveries_update
  after update of status on public.refunds
  for each row
  when (new.status = 'COMPLETED')
  execute function public.record_partner_recovery_for_refund();

create or replace function public.apply_settlement_recoveries_on_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected integer;
  v_updated integer;
begin
  if old.status <> 'DRAFT' or new.status <> 'CONFIRMED' then
    return new;
  end if;

  select count(*) into v_expected
  from (
    select item.ref_id
    from public.settlement_items item
    where item.statement_id = new.id
      and item.ref_type = 'RECOVERY'
    group by item.ref_id
  ) allocations;

  update public.partner_recoveries recovery
  set recovered_amount = recovery.recovered_amount + allocation.amount
  from (
    select item.ref_id, sum(item.amount) as amount
    from public.settlement_items item
    where item.statement_id = new.id
      and item.ref_type = 'RECOVERY'
    group by item.ref_id
  ) allocation
  where recovery.id = allocation.ref_id
    and recovery.recovered_amount + allocation.amount <= recovery.amount;
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'INVALID_STATE: recovery allocation exceeds outstanding amount';
  end if;

  return new;
end;
$$;

create trigger settlement_apply_recoveries_on_confirmation
  after update of status on public.settlement_statements
  for each row
  execute function public.apply_settlement_recoveries_on_confirmation();

create or replace function public.generate_settlement(
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
  v_sid uuid;
  v_row record;
  v_recovery record;
  v_gross numeric := 0;
  v_refund numeric := 0;
  v_platform_fee numeric := 0;
  v_refund_fee numeric := 0;
  v_adjustments numeric := 0;
  v_recoveries numeric := 0;
  v_net numeric := 0;
  v_refund_share numeric;
  v_recovery_share numeric;
begin
  if p_start is null or p_end is null
     or p_start <> date_trunc('month', p_start)::date
     or p_end <> (p_start + interval '1 month - 1 day')::date
     or not exists (select 1 from public.partner_profiles where user_id = p_partner) then
    raise exception 'VALIDATION: choose a valid partner and complete calendar month';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_partner::text || ':' || p_start::text || ':' || p_end::text, 0)
  );

  select id into v_sid
  from public.settlement_statements
  where partner_id = p_partner
    and period_start = p_start
    and period_end = p_end;
  if v_sid is not null then
    return jsonb_build_object('statement_id', v_sid, 'exists', true);
  end if;

  insert into public.settlement_statements (partner_id, period_start, period_end)
  values (p_partner, p_start, p_end)
  returning id into v_sid;

  for v_row in
    select o.id, o.subtotal, o.platform_fee
    from public.orders o
    where o.partner_id = p_partner
      and o.order_level = 'CHILD'
      and o.status in ('DELIVERED', 'COMPLETED', 'RETURNED')
      and o.placed_at >= p_start::timestamptz
      and o.placed_at < (p_end + 1)::timestamptz
      and exists (
        select 1
        from public.payments payment
        where payment.purpose = 'ORDER'
          and payment.reference_id = o.parent_order_id
          and payment.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
          and payment.business_sync_status = 'SYNCED'
      )
    order by o.id
  loop
    v_gross := v_gross + v_row.subtotal;
    v_platform_fee := v_platform_fee + v_row.platform_fee;

    insert into public.settlement_items (
      statement_id, ref_type, ref_id, amount, direction
    )
    values (
      v_sid, 'SUB_ORDER', v_row.id, v_row.subtotal, 'CREDIT'
    );
  end loop;

  for v_row in
    select refund.id, refund.amount, child.subtotal, child.platform_fee,
      parent_total.total
    from public.refunds refund
    join public.payments payment on payment.id = refund.payment_id
    join lateral (
      select child_order.*
      from public.orders child_order
      where child_order.parent_order_id = payment.reference_id
        and child_order.partner_id = p_partner
        and child_order.order_level = 'CHILD'
      and child_order.status in ('DELIVERED', 'COMPLETED', 'RETURNED')
      and child_order.placed_at >= p_start::timestamptz
      and child_order.placed_at < (p_end + 1)::timestamptz
    ) child on true
    join lateral (
      select coalesce(sum(child_order.subtotal), 0) as total
      from public.orders child_order
      where child_order.parent_order_id = payment.reference_id
        and child_order.order_level = 'CHILD'
    ) parent_total on true
    where payment.purpose = 'ORDER'
      and payment.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
      and payment.business_sync_status = 'SYNCED'
      and refund.status = 'COMPLETED'
      and refund.created_at >= p_start::timestamptz
      and refund.created_at < (p_end + 1)::timestamptz
      and parent_total.total > 0
  loop
    v_refund_share := round(v_row.amount * v_row.subtotal / v_row.total, 0);
    if v_refund_share > 0 then
      v_refund := v_refund + v_refund_share;
      v_refund_fee := v_refund_fee + least(
        v_row.platform_fee,
        round(v_row.platform_fee * v_refund_share / nullif(v_row.subtotal, 0), 0)
      );
      insert into public.settlement_items (
        statement_id, ref_type, ref_id, amount, direction
      )
      values (
        v_sid, 'REFUND', v_row.id, v_refund_share, 'DEBIT'
      );
      insert into public.settlement_items (
        statement_id, ref_type, ref_id, amount, direction
      )
      values (
        v_sid,
        'REFUND_COMMISSION',
        v_row.id,
        least(v_row.platform_fee, round(v_row.platform_fee * v_refund_share / nullif(v_row.subtotal, 0), 0)),
        'CREDIT'
      )
      on conflict (statement_id, ref_type, ref_id) do nothing;
    end if;
  end loop;

  for v_row in
    select adjustment.id, adjustment.amount
    from public.adjustments adjustment
    where adjustment.partner_id = p_partner
      and adjustment.created_at >= p_start::timestamptz
      and adjustment.created_at < (p_end + 1)::timestamptz
    order by adjustment.created_at, adjustment.id
  loop
    v_adjustments := v_adjustments + v_row.amount;
    insert into public.settlement_items (
      statement_id, ref_type, ref_id, amount, direction
    )
    values (
      v_sid,
      'ADJUSTMENT',
      v_row.id,
      abs(v_row.amount),
      case when v_row.amount >= 0 then 'CREDIT' else 'DEBIT' end
    );
  end loop;

  v_platform_fee := greatest(v_platform_fee - v_refund_fee, 0);
  v_net := v_gross - v_refund - v_platform_fee + v_adjustments;

  for v_recovery in
    select recovery.id,
      recovery.amount
        - recovery.recovered_amount
        - coalesce((
          select sum(reserved_item.amount)
          from public.settlement_items reserved_item
          join public.settlement_statements reserved_statement
            on reserved_statement.id = reserved_item.statement_id
          where reserved_item.ref_type = 'RECOVERY'
            and reserved_item.ref_id = recovery.id
            and reserved_statement.status = 'DRAFT'
        ), 0) as remaining
    from public.partner_recoveries recovery
    where recovery.partner_id = p_partner
      and recovery.amount > recovery.recovered_amount
    order by recovery.created_at, recovery.id
    for update
  loop
    exit when v_net <= 0;
    if v_recovery.remaining <= 0 then
      continue;
    end if;
    v_recovery_share := least(v_recovery.remaining, v_net);
    if v_recovery_share > 0 then
      insert into public.settlement_items (
        statement_id, ref_type, ref_id, amount, direction
      )
      values (
        v_sid, 'RECOVERY', v_recovery.id, v_recovery_share, 'DEBIT'
      );

      v_recoveries := v_recoveries + v_recovery_share;
      v_net := v_net - v_recovery_share;
    end if;
  end loop;

  update public.settlement_statements
  set gross_amount = v_gross,
      refund_amount = v_refund,
      platform_fee = v_platform_fee,
      adjustments = v_adjustments - v_recoveries,
      net_payable = v_net
  where id = v_sid;

  return jsonb_build_object(
    'statement_id', v_sid,
    'gross', v_gross,
    'refund', v_refund,
    'platform_fee', v_platform_fee,
    'adjustments', v_adjustments,
    'recoveries', v_recoveries,
    'net', v_net
  );
end;
$$;

revoke all on function public.admin_record_financial_expense(uuid, text, text, numeric, timestamptz, text) from public, anon, authenticated;
revoke all on function public.record_partner_recovery_for_refund() from public, anon, authenticated;
revoke all on function public.apply_settlement_recoveries_on_confirmation() from public, anon, authenticated;
revoke all on function public.generate_settlement(uuid, date, date) from public, anon, authenticated;
grant execute on function public.admin_record_financial_expense(uuid, text, text, numeric, timestamptz, text) to service_role;
grant execute on function public.generate_settlement(uuid, date, date) to service_role;
