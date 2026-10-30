alter table public.users
  add column if not exists address text;

create or replace function public.sync_auth_user_email_to_public()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.users
     set email = new.email,
         updated_at = now()
   where id = new.id
     and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists sync_auth_user_email_to_public on auth.users;
create trigger sync_auth_user_email_to_public
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_auth_user_email_to_public();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ocop-profile-avatars-v1',
  'ocop-profile-avatars-v1',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists profile_avatars_insert_own on storage.objects;
create policy profile_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ocop-profile-avatars-v1'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.cancel_registration_for_customer(p_registration uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_customer uuid := auth.uid();
  v_registration public.workshop_registrations%rowtype;
  v_starts_at timestamptz;
begin
  if v_customer is null then
    raise exception 'FORBIDDEN';
  end if;

  perform p.id
    from public.payments p
   where p.purpose = 'WORKSHOP_REGISTRATION'
     and p.reference_id = p_registration
   order by p.id
   for update;

  select * into v_registration
    from public.workshop_registrations
   where id = p_registration
   for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_registration.customer_id <> v_customer then
    raise exception 'FORBIDDEN';
  end if;

  if v_registration.status not in ('PENDING', 'PAYMENT_PROCESSING') then
    raise exception 'REGISTRATION_NOT_CANCELLABLE';
  end if;

  if exists (
    select 1
      from public.payments p
     where p.purpose = 'WORKSHOP_REGISTRATION'
       and p.reference_id = p_registration
       and p.status in ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
  ) then
    raise exception 'PAYMENT_ALREADY_COMPLETED';
  end if;

  select starts_at into v_starts_at
    from public.workshop_sessions
   where id = v_registration.session_id
   for update;

  if v_starts_at is null or v_starts_at <= now() then
    raise exception 'SESSION_STARTED';
  end if;

  update public.payments
     set status = 'CANCELLED',
         updated_at = now()
   where purpose = 'WORKSHOP_REGISTRATION'
     and reference_id = p_registration
     and status in ('CREATED', 'PENDING');

  update public.workshop_registrations
     set status = 'CANCELLED_BY_CUSTOMER',
         hold_expires_at = null,
         updated_at = now()
   where id = p_registration;

  update public.workshop_sessions
     set remaining_seats = least(remaining_seats + 1, capacity),
         updated_at = now()
   where id = v_registration.session_id;

  return jsonb_build_object('result', 'CANCELLED');
end;
$$;

revoke all on function public.cancel_registration_for_customer(uuid) from public, anon;
grant execute on function public.cancel_registration_for_customer(uuid) to authenticated;
revoke all on function public.cancel_registration(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_registration(uuid, uuid, text) to service_role;