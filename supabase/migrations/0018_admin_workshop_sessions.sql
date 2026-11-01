create or replace function public.admin_set_workshop_session_status(
  p_admin uuid,
  p_session uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.workshop_sessions%rowtype;
  v_workshop_status public.workshop_status;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_status is null or p_status not in ('OPEN', 'CLOSED') then
    raise exception 'VALIDATION: session can only be opened or closed';
  end if;

  select * into v_session
  from public.workshop_sessions
  where id = p_session
  for update;
  if not found then
    raise exception 'NOT_FOUND: workshop session';
  end if;
  if v_session.status not in ('SCHEDULED', 'OPEN', 'CLOSED') then
    raise exception 'INVALID_STATE: session has already started or ended';
  end if;
  if v_session.status = p_status then
    raise exception 'INVALID_STATE: session already has this status';
  end if;
  if p_status = 'OPEN' then
    if v_session.starts_at <= now() then
      raise exception 'INVALID_STATE: session has already started';
    end if;
    if v_session.remaining_seats <= 0 then
      raise exception 'NO_SEATS';
    end if;
    select status into v_workshop_status
    from public.workshops
    where id = v_session.workshop_id;
    if v_workshop_status <> 'APPROVED' then
      raise exception 'INVALID_STATE: workshop must be approved before opening a session';
    end if;
  end if;

  update public.workshop_sessions
  set status = p_status::public.session_status,
      updated_at = now()
  where id = p_session;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before, after)
  values (
    p_admin, 'ADMIN', 'WORKSHOP_SESSION_STATUS_CHANGED', 'workshop_session', p_session::text,
    jsonb_build_object('status', v_session.status),
    jsonb_build_object('status', p_status, 'workshop_id', v_session.workshop_id)
  );
  return jsonb_build_object('ok', true, 'session_id', p_session, 'status', p_status);
end;
$$;

revoke all on function public.admin_set_workshop_session_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_workshop_session_status(uuid, uuid, text) to service_role;
