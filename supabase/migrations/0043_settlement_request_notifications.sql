create function public.notify_admins_of_settlement_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
  select admin_role.user_id,
    'settlement_request_submitted',
    'Yêu cầu đối soát mới',
    format('%s gửi yêu cầu đối soát kỳ %s.',
      partner.business_name, to_char(statement.period_start, 'MM/YYYY')),
    'settlement_request',
    new.id
  from public.user_roles admin_role
  join public.partner_profiles partner on partner.user_id = new.partner_id
  join public.settlement_statements statement on statement.id = new.statement_id
  where admin_role.role = 'ADMIN';

  return new;
end;
$$;

revoke all on function public.notify_admins_of_settlement_request() from public, anon, authenticated;

create trigger settlement_request_notify_admins
after insert on public.settlement_requests
for each row when (new.status = 'REQUESTED')
execute function public.notify_admins_of_settlement_request();
