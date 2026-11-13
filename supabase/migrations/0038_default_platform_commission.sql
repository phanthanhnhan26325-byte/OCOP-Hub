insert into public.fee_config (scope, partner_id, type, rules, effective_from)
select 'GLOBAL', null, 'PLATFORM_RATE', '{"rate": 0.10}'::jsonb, now()
where not exists (
  select 1
  from public.fee_config
  where scope = 'GLOBAL'
    and partner_id is null
    and type = 'PLATFORM_RATE'
    and effective_from <= now()
    and (effective_to is null or effective_to > now())
);

create or replace function public.fee_for(p_partner uuid, p_type text)
returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select (rules->>'rate')::numeric
      from public.fee_config
      where type = p_type
        and (
          (scope = 'PARTNER' and partner_id = p_partner)
          or (scope = 'GLOBAL' and partner_id is null)
        )
        and effective_from <= now()
        and (effective_to is null or effective_to > now())
      order by scope desc
      limit 1
    ),
    case when p_type = 'PLATFORM_RATE' then 0.10 else 0 end
  );
$$;
