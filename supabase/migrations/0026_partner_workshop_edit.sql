-- Allow editing while preserving existing sessions and reserved seats.
-- Server-only transaction; validate the form in the authenticated PATCH route.
create or replace function public.partner_resubmit_workshop(p_workshop uuid, p_partner uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_workshop public.workshops%rowtype;
  v_session public.workshop_sessions%rowtype;
  v_input jsonb;
begin
  if not exists (select 1 from public.partner_profiles where user_id = p_partner and selling_status = 'APPROVED')
     or not exists (select 1 from public.user_roles where user_id = p_partner and role = 'PARTNER') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_workshop from public.workshops where id = p_workshop and partner_id = p_partner for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.workshop_sessions where workshop_id = p_workshop order by id for update;
  -- Existing sessions are retained, including registration history and reserved seats.
  if exists (select 1 from public.workshop_sessions s where s.workshop_id = p_workshop and not exists (
    select 1 from jsonb_array_elements(p_data->'sessions') i where (i->>'id')::uuid = s.id
  )) then raise exception 'VALIDATION: Không được bỏ buổi tổ chức hiện có'; end if;
  for v_input in select value from jsonb_array_elements(p_data->'sessions') loop
    if v_input->>'id' is null then
      insert into public.workshop_sessions(workshop_id, starts_at, ends_at, location, fee, capacity, remaining_seats, status)
      values(p_workshop, (v_input->>'startsAt')::timestamptz, (v_input->>'endsAt')::timestamptz,
        v_input->>'location', (v_input->>'fee')::numeric, (v_input->>'capacity')::int, (v_input->>'capacity')::int, 'SCHEDULED');
    else
      select * into v_session from public.workshop_sessions where id = (v_input->>'id')::uuid and workshop_id = p_workshop;
      if not found then raise exception 'VALIDATION: Buổi tổ chức không thuộc workshop'; end if;
      if (v_input->>'capacity')::int < v_session.capacity - v_session.remaining_seats then
        raise exception 'VALIDATION: Sức chứa thấp hơn số chỗ đã được giữ';
      end if;
      update public.workshop_sessions set
        starts_at = (v_input->>'startsAt')::timestamptz, ends_at = (v_input->>'endsAt')::timestamptz,
        location = v_input->>'location', fee = (v_input->>'fee')::numeric,
        capacity = (v_input->>'capacity')::int,
        remaining_seats = (v_input->>'capacity')::int - (v_session.capacity - v_session.remaining_seats), updated_at = now()
      where id = v_session.id;
    end if;
  end loop;
  update public.workshops set title = p_data->>'title', description = p_data->>'description',
    experience_content = coalesce(p_data->>'experienceContent', ''),
    cover_image = nullif(p_data->>'coverImage', ''),
    reject_reason = null, status = 'PENDING', updated_at = now() where id = p_workshop;
end;
$$;
revoke all on function public.partner_resubmit_workshop(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.partner_resubmit_workshop(uuid, uuid, jsonb) to service_role;
