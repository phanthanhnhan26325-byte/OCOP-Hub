create function public.apply_workshop_settlement_revenue(p_statement uuid)
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
    select registration.id, registration.amount
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
    end if;
  end loop;

  if v_workshop_gross = 0 then
    return jsonb_build_object(
      'workshop_gross', 0,
      'recoveries', 0,
      'gross', v_statement.gross_amount,
      'net', v_statement.net_payable
    );
  end if;

  v_available := v_statement.net_payable + v_workshop_gross;
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
      'net_payable', v_statement.net_payable
    ),
    jsonb_build_object(
      'gross_amount', v_statement.gross_amount + v_workshop_gross,
      'net_payable', v_available,
      'workshop_revenue', v_workshop_gross,
      'recoveries', v_extra_recoveries
    )
  );

  return jsonb_build_object(
    'workshop_gross', v_workshop_gross,
    'recoveries', v_extra_recoveries,
    'gross', v_statement.gross_amount + v_workshop_gross,
    'net', v_available
  );
end;
$$;

do $$
declare
  v_statement_id uuid;
begin
  for v_statement_id in
    select statement.id
    from public.settlement_statements statement
    where statement.status = 'DRAFT'
      and exists (
        select 1
        from public.workshops workshop
        join public.workshop_sessions session on session.workshop_id = workshop.id
        join public.workshop_registrations registration on registration.session_id = session.id
        where workshop.partner_id = statement.partner_id
          and registration.status in ('CONFIRMED', 'COMPLETED')
          and registration.created_at >= statement.period_start::timestamptz
          and registration.created_at < (statement.period_end + 1)::timestamptz
          and exists (
            select 1
            from public.payments payment
            where payment.purpose = 'WORKSHOP_REGISTRATION'
              and payment.reference_id = registration.id
              and payment.status = 'PAID'
              and payment.business_sync_status = 'SYNCED'
          )
      )
  loop
    perform public.apply_workshop_settlement_revenue(v_statement_id);
  end loop;
end;
$$;

alter function public.generate_settlement(uuid, date, date)
  rename to generate_settlement_products_only;

create function public.generate_settlement(
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
  if coalesce((v_result->>'exists')::boolean, false) then
    return v_result;
  end if;

  v_statement := (v_result->>'statement_id')::uuid;
  v_workshop_result := public.apply_workshop_settlement_revenue(v_statement);

  return v_result || jsonb_build_object(
    'gross', v_workshop_result->'gross',
    'net', v_workshop_result->'net',
    'workshop_gross', v_workshop_result->'workshop_gross',
    'recoveries', coalesce((v_result->>'recoveries')::numeric, 0)
      + coalesce((v_workshop_result->>'recoveries')::numeric, 0)
  );
end;
$$;

revoke all on function public.apply_workshop_settlement_revenue(uuid)
  from public, anon, authenticated;
revoke all on function public.generate_settlement_products_only(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.generate_settlement_products_only(uuid, date, date)
  to service_role;
revoke all on function public.generate_settlement(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.generate_settlement(uuid, date, date)
  to service_role;
