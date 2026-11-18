alter table public.workshop_registrations
  add column if not exists platform_fee numeric(12,2) not null default 0
  check (platform_fee >= 0);

update public.workshop_registrations registration
set platform_fee = round(
  registration.amount * coalesce(
    (
      select (config.rules->>'rate')::numeric
      from public.fee_config config
      where config.type = 'PLATFORM_RATE'
        and (
          (config.scope = 'PARTNER' and config.partner_id = workshop.partner_id)
          or (config.scope = 'GLOBAL' and config.partner_id is null)
        )
        and config.effective_from <= registration.created_at
        and (config.effective_to is null or config.effective_to > registration.created_at)
      order by config.scope desc, config.effective_from desc
      limit 1
    ),
    0.10
  ),
  0
)
from public.workshop_sessions session
join public.workshops workshop on workshop.id = session.workshop_id
where registration.session_id = session.id
  and registration.platform_fee = 0
  and registration.amount > 0;

do $$
declare
  v_statement record;
  v_registration record;
  v_recovery record;
  v_old_gross numeric;
  v_old_platform_fee numeric;
  v_old_net numeric;
  v_workshop_fee numeric;
  v_restore_recovery numeric;
  v_fee_remaining numeric;
  v_recovery_reduction numeric;
begin
  for v_statement in
    select statement.id,
      statement.gross_amount,
      statement.platform_fee,
      statement.net_payable
    from public.settlement_statements statement
    where statement.status = 'DRAFT'
      and exists (
        select 1
        from public.settlement_items item
        join public.workshop_registrations registration on registration.id = item.ref_id
        where item.statement_id = statement.id
          and item.ref_type = 'WORKSHOP_REGISTRATION'
          and registration.platform_fee > 0
          and not exists (
            select 1
            from public.settlement_items commission_item
            where commission_item.statement_id = statement.id
              and commission_item.ref_type = 'WORKSHOP_COMMISSION'
              and commission_item.ref_id = registration.id
          )
      )
    order by statement.id
    for update of statement
  loop
    select coalesce(sum(registration.platform_fee), 0)
    into v_workshop_fee
    from public.settlement_items item
    join public.workshop_registrations registration on registration.id = item.ref_id
    where item.statement_id = v_statement.id
      and item.ref_type = 'WORKSHOP_REGISTRATION'
      and registration.platform_fee > 0
      and not exists (
        select 1
        from public.settlement_items commission_item
        where commission_item.statement_id = v_statement.id
          and commission_item.ref_type = 'WORKSHOP_COMMISSION'
          and commission_item.ref_id = registration.id
      );
    if v_workshop_fee <= 0 then
      continue;
    end if;

    v_old_gross := v_statement.gross_amount;
    v_old_platform_fee := v_statement.platform_fee;
    v_old_net := v_statement.net_payable;
    v_restore_recovery := 0;
    v_fee_remaining := v_workshop_fee;

    for v_registration in
      select registration.id, registration.platform_fee
      from public.settlement_items item
      join public.workshop_registrations registration on registration.id = item.ref_id
      where item.statement_id = v_statement.id
        and item.ref_type = 'WORKSHOP_REGISTRATION'
        and registration.platform_fee > 0
        and not exists (
          select 1
          from public.settlement_items commission_item
          where commission_item.statement_id = v_statement.id
            and commission_item.ref_type = 'WORKSHOP_COMMISSION'
            and commission_item.ref_id = registration.id
        )
    loop
      insert into public.settlement_items (
        statement_id, ref_type, ref_id, amount, direction
      )
      values (
        v_statement.id,
        'WORKSHOP_COMMISSION',
        v_registration.id,
        v_registration.platform_fee,
        'DEBIT'
      )
      on conflict (statement_id, ref_type, ref_id) do nothing;
    end loop;

    for v_recovery in
      select id, amount
      from public.settlement_items
      where statement_id = v_statement.id
        and ref_type = 'RECOVERY'
      order by created_at desc, id desc
      for update
    loop
      exit when v_fee_remaining <= 0;
      v_recovery_reduction := least(v_recovery.amount, v_fee_remaining);
      if v_recovery.amount = v_recovery_reduction then
        delete from public.settlement_items where id = v_recovery.id;
      else
        update public.settlement_items
        set amount = amount - v_recovery_reduction
        where id = v_recovery.id;
      end if;
      v_fee_remaining := v_fee_remaining - v_recovery_reduction;
      v_restore_recovery := v_restore_recovery + v_recovery_reduction;
    end loop;

    update public.settlement_statements
    set platform_fee = platform_fee + v_workshop_fee,
        adjustments = adjustments + v_restore_recovery,
        net_payable = net_payable - v_workshop_fee + v_restore_recovery
    where id = v_statement.id;

    insert into public.audit_logs (
      actor_role, action, entity_type, entity_id, before, after
    )
    values (
      'SYSTEM',
      'WORKSHOP_COMMISSION_ADDED_TO_SETTLEMENT',
      'settlement',
      v_statement.id::text,
      jsonb_build_object(
        'gross_amount', v_old_gross,
        'platform_fee', v_old_platform_fee,
        'net_payable', v_old_net
      ),
      jsonb_build_object(
        'gross_amount', v_old_gross,
        'platform_fee', v_old_platform_fee + v_workshop_fee,
        'net_payable', v_old_net - v_workshop_fee + v_restore_recovery,
        'workshop_commission', v_workshop_fee,
        'recovery_released', v_restore_recovery
      )
    );
  end loop;
end;
$$;

create or replace function public.register_workshop(
  p_session uuid,
  p_customer uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.workshop_sessions%rowtype;
  v_partner uuid;
  v_reg uuid;
  v_code text;
  v_hold timestamptz;
  v_platform_fee numeric;
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

  select workshop.partner_id into v_partner
  from public.workshops workshop
  where workshop.id = v_session.workshop_id;
  v_platform_fee := round(v_session.fee * public.fee_for(v_partner, 'PLATFORM_RATE'), 0);
  v_code := public.gen_reg_code();
  v_hold := now() + (
    coalesce(
      nullif(current_setting('app.hold_ttl_minutes', true), ''),
      '30'
    ) || ' minutes'
  )::interval;

  begin
    insert into public.workshop_registrations (
      code, session_id, customer_id, status, amount, platform_fee, hold_expires_at
    )
    values (
      v_code, p_session, p_customer, 'PENDING', v_session.fee, v_platform_fee, v_hold
    )
    returning id into v_reg;
  exception when unique_violation then
    raise exception 'ALREADY_REGISTERED';
  end;

  update public.workshop_sessions
  set remaining_seats = remaining_seats - 1,
      updated_at = now()
  where id = p_session and remaining_seats > 0;
  if not found then
    raise exception 'NO_SEATS';
  end if;

  return jsonb_build_object(
    'registration_id', v_reg,
    'code', v_code,
    'amount', v_session.fee,
    'platform_fee', v_platform_fee,
    'hold_expires_at', v_hold
  );
end;
$$;

create or replace function public.apply_workshop_settlement_revenue(p_statement uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statement public.settlement_statements%rowtype;
  v_registration record;
  v_recovery record;
  v_inserted_amount numeric;
  v_workshop_gross numeric := 0;
  v_workshop_fee numeric := 0;
  v_extra_recoveries numeric := 0;
  v_available numeric;
  v_recovery_share numeric;
begin
  select * into v_statement
  from public.settlement_statements
  where id = p_statement
  for update;
  if not found or v_statement.status <> 'DRAFT' then
    raise exception 'INVALID_STATE: workshop revenue can only be added to draft settlements';
  end if;

  for v_registration in
    select registration.id, registration.amount, registration.platform_fee
    from public.workshops workshop
    join public.workshop_sessions session on session.workshop_id = workshop.id
    join public.workshop_registrations registration on registration.session_id = session.id
    where workshop.partner_id = v_statement.partner_id
      and registration.status in ('CONFIRMED', 'COMPLETED')
      and registration.created_at >= v_statement.period_start::timestamptz
      and registration.created_at < (v_statement.period_end + 1)::timestamptz
      and exists (
        select 1
        from public.payments payment
        where payment.purpose = 'WORKSHOP_REGISTRATION'
          and payment.reference_id = registration.id
          and payment.status = 'PAID'
          and payment.business_sync_status = 'SYNCED'
      )
    order by registration.id
  loop
    insert into public.settlement_items (
      statement_id, ref_type, ref_id, amount, direction
    )
    values (
      p_statement, 'WORKSHOP_REGISTRATION', v_registration.id, v_registration.amount, 'CREDIT'
    )
    on conflict (statement_id, ref_type, ref_id) do nothing
    returning amount into v_inserted_amount;

    if found then
      v_workshop_gross := v_workshop_gross + v_inserted_amount;
      v_workshop_fee := v_workshop_fee + v_registration.platform_fee;
      if v_registration.platform_fee > 0 then
        insert into public.settlement_items (
          statement_id, ref_type, ref_id, amount, direction
        )
        values (
          p_statement, 'WORKSHOP_COMMISSION', v_registration.id, v_registration.platform_fee, 'DEBIT'
        );
      end if;
    end if;
  end loop;

  if v_workshop_gross = 0 then
    return jsonb_build_object(
      'workshop_gross', 0,
      'workshop_fee', 0,
      'recoveries', 0,
      'gross', v_statement.gross_amount,
      'net', v_statement.net_payable
    );
  end if;

  v_available := v_statement.net_payable + v_workshop_gross - v_workshop_fee;
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
    where recovery.partner_id = v_statement.partner_id
      and recovery.amount > recovery.recovered_amount
    order by recovery.created_at, recovery.id
    for update
  loop
    exit when v_available <= 0;
    if v_recovery.remaining <= 0 then
      continue;
    end if;

    v_recovery_share := least(v_recovery.remaining, v_available);
    insert into public.settlement_items (
      statement_id, ref_type, ref_id, amount, direction
    )
    values (
      p_statement, 'RECOVERY', v_recovery.id, v_recovery_share, 'DEBIT'
    );
    v_extra_recoveries := v_extra_recoveries + v_recovery_share;
    v_available := v_available - v_recovery_share;
  end loop;

  update public.settlement_statements
  set gross_amount = gross_amount + v_workshop_gross,
      platform_fee = platform_fee + v_workshop_fee,
      adjustments = adjustments - v_extra_recoveries,
      net_payable = v_available
  where id = p_statement;

  insert into public.audit_logs (
    actor_role, action, entity_type, entity_id, before, after
  )
  values (
    'SYSTEM',
    'WORKSHOP_REVENUE_ADDED_TO_SETTLEMENT',
    'settlement',
    p_statement::text,
    jsonb_build_object(
      'gross_amount', v_statement.gross_amount,
      'platform_fee', v_statement.platform_fee,
      'net_payable', v_statement.net_payable
    ),
    jsonb_build_object(
      'gross_amount', v_statement.gross_amount + v_workshop_gross,
      'platform_fee', v_statement.platform_fee + v_workshop_fee,
      'net_payable', v_available,
      'workshop_revenue', v_workshop_gross,
      'workshop_commission', v_workshop_fee,
      'recoveries', v_extra_recoveries
    )
  );

  return jsonb_build_object(
    'workshop_gross', v_workshop_gross,
    'workshop_fee', v_workshop_fee,
    'recoveries', v_extra_recoveries,
    'gross', v_statement.gross_amount + v_workshop_gross,
    'platform_fee', v_statement.platform_fee + v_workshop_fee,
    'net', v_available
  );
end;
$$;

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
  v_result jsonb;
  v_workshop_result jsonb;
  v_statement uuid;
begin
  v_result := public.generate_settlement_products_only(p_partner, p_start, p_end);
  v_statement := nullif(v_result->>'statement_id', '')::uuid;
  if v_statement is null or not exists (
    select 1
    from public.settlement_statements statement
    where statement.id = v_statement
      and statement.status = 'DRAFT'
  ) then
    return v_result;
  end if;

  v_workshop_result := public.apply_workshop_settlement_revenue(v_statement);
  return v_result || jsonb_build_object(
    'gross', v_workshop_result->'gross',
    'net', v_workshop_result->'net',
    'workshop_gross', v_workshop_result->'workshop_gross',
    'workshop_fee', v_workshop_result->'workshop_fee',
    'recoveries', coalesce((v_result->>'recoveries')::numeric, 0)
      + coalesce((v_workshop_result->>'recoveries')::numeric, 0)
  );
end;
$$;
