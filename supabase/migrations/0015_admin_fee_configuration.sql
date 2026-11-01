create or replace function public.admin_upsert_fee_config(
  p_admin uuid,
  p_scope text,
  p_partner uuid,
  p_type text,
  p_rules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_id uuid;
  v_value numeric;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_scope is null
     or p_type is null
     or p_rules is null
     or p_scope not in ('GLOBAL', 'PARTNER')
     or (p_scope = 'GLOBAL' and p_partner is not null)
     or (p_scope = 'PARTNER' and p_partner is null)
     or p_type not in ('PLATFORM_RATE', 'SHIPPING')
     or jsonb_typeof(p_rules) <> 'object' then
    raise exception 'VALIDATION: invalid fee configuration';
  end if;
  if p_scope = 'PARTNER' and not exists (
    select 1 from public.partner_profiles where user_id = p_partner
  ) then
    raise exception 'NOT_FOUND: partner';
  end if;

  if p_type = 'PLATFORM_RATE' then
    if coalesce(jsonb_typeof(p_rules->'rate'), '') <> 'number' then
      raise exception 'VALIDATION: rate must be numeric';
    end if;
    v_value := (p_rules->>'rate')::numeric;
    if v_value < 0 or v_value > 1 then
      raise exception 'VALIDATION: rate must be between 0 and 1';
    end if;
  else
    if coalesce(jsonb_typeof(p_rules->'flat'), '') <> 'number' then
      raise exception 'VALIDATION: flat must be numeric';
    end if;
    v_value := (p_rules->>'flat')::numeric;
    if v_value < 0 then
      raise exception 'VALIDATION: shipping fee cannot be negative';
    end if;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_scope || ':' || coalesce(p_partner::text, 'GLOBAL') || ':' || p_type, 0)
  );

  update public.fee_config
  set effective_to = v_now
  where scope = p_scope
    and partner_id is not distinct from p_partner
    and type = p_type
    and effective_from <= v_now
    and (effective_to is null or effective_to > v_now);

  insert into public.fee_config (scope, partner_id, type, rules, effective_from)
  values (p_scope, p_partner, p_type, p_rules, v_now)
  returning id into v_id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'FEE_CONFIG_UPDATED', 'fee_config', v_id::text,
    jsonb_build_object('scope', p_scope, 'partner_id', p_partner, 'type', p_type, 'rules', p_rules)
  );

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.admin_upsert_fee_config(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_upsert_fee_config(uuid, text, uuid, text, jsonb) to service_role;
