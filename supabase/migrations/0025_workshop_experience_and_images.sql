alter table public.workshops add column if not exists experience_content text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ocop-workshop-images-v1',
  'ocop-workshop-images-v1',
  true,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workshop_images_upload_partner on storage.objects;
create policy workshop_images_upload_partner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ocop-workshop-images-v1'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_partner_approved()
  );

drop policy if exists workshop_images_delete_partner on storage.objects;
create policy workshop_images_delete_partner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ocop-workshop-images-v1'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_partner_approved()
  );

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
  if v_workshop.status not in ('DRAFT', 'REJECTED') then
    raise exception 'INVALID_STATE: Chỉ có thể sửa workshop nháp hoặc bị từ chối';
  end if;
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
      if exists (select 1 from public.workshop_registrations where session_id = v_session.id) and (
        v_session.starts_at is distinct from (v_input->>'startsAt')::timestamptz or
        v_session.ends_at is distinct from (v_input->>'endsAt')::timestamptz or
        v_session.location is distinct from v_input->>'location' or
        v_session.fee is distinct from (v_input->>'fee')::numeric or
        v_session.capacity is distinct from (v_input->>'capacity')::int
      ) then raise exception 'INVALID_STATE: Buổi tổ chức đã có lịch sử đăng ký nên không thể sửa lịch, địa điểm, phí hoặc sức chứa'; end if;
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
