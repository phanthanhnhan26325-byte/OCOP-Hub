create table public.partner_payout_accounts (
  partner_id uuid primary key references public.partner_profiles(user_id) on delete cascade,
  bank_name text not null,
  account_holder text not null,
  account_number text not null,
  updated_at timestamptz not null default now(),
  constraint ck_partner_payout_account_bank check (length(trim(bank_name)) between 2 and 100),
  constraint ck_partner_payout_account_holder check (length(trim(account_holder)) between 2 and 120),
  constraint ck_partner_payout_account_number check (length(trim(account_number)) between 5 and 34)
);

alter table public.partner_payout_accounts enable row level security;
create policy partner_payout_accounts_select on public.partner_payout_accounts
  for select using (partner_id = auth.uid() or public.is_admin());
revoke all on public.partner_payout_accounts from anon, authenticated;
grant select on public.partner_payout_accounts to authenticated;

create table public.settlement_requests (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.settlement_statements(id) on delete restrict,
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  requested_amount numeric(14, 2) not null check (requested_amount > 0),
  bank_name text not null,
  account_holder text not null,
  account_number text not null,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'APPROVED', 'REJECTED', 'PAID')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id),
  rejection_reason text,
  paid_at timestamptz,
  proof_path text,
  transfer_reference text,
  created_at timestamptz not null default now(),
  constraint ck_settlement_request_rejection check (
    status <> 'REJECTED' or length(trim(coalesce(rejection_reason, ''))) >= 3
  ),
  constraint ck_settlement_request_paid_proof check (
    status <> 'PAID' or (paid_at is not null and proof_path is not null and transfer_reference is not null)
  )
);

create index idx_settlement_requests_partner on public.settlement_requests(partner_id, requested_at desc);
create index idx_settlement_requests_status on public.settlement_requests(status, requested_at desc);
create unique index uq_settlement_request_active_statement
  on public.settlement_requests(statement_id)
  where status in ('REQUESTED', 'APPROVED');

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

alter table public.settlement_requests enable row level security;
create policy settlement_requests_select on public.settlement_requests
  for select using (partner_id = auth.uid() or public.is_admin());
revoke all on public.settlement_requests from anon, authenticated;
grant select on public.settlement_requests to authenticated;

alter table public.payouts add column evidence_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ocop-settlement-payout-proofs-v1',
  'ocop-settlement-payout-proofs-v1',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.partner_request_settlement(
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
  v_statement uuid;
  v_net numeric;
  v_paid numeric;
  v_request uuid;
  v_bank public.partner_payout_accounts%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_partner
     or not exists (
       select 1 from public.partner_profiles
       where user_id = p_partner and selling_status = 'APPROVED'
     ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_start is null
     or p_end is null
     or p_start <> date_trunc('month', p_start)::date
     or p_end <> (p_start + interval '1 month - 1 day')::date
     or p_end >= date_trunc('month', current_date)::date then
    raise exception 'VALIDATION: settlement requests are available for closed calendar months only';
  end if;

  select * into v_bank
  from public.partner_payout_accounts
  where partner_id = p_partner;
  if not found then
    raise exception 'PAYOUT_ACCOUNT_REQUIRED';
  end if;

  v_result := public.generate_settlement(p_partner, p_start, p_end);
  v_statement := (v_result->>'statement_id')::uuid;

  select net_payable into v_net
  from public.settlement_statements
  where id = v_statement and partner_id = p_partner
  for update;
  if not found or v_net <= 0 then
    raise exception 'NO_SETTLEMENT_AMOUNT';
  end if;
  select coalesce(sum(amount), 0) into v_paid
  from public.payouts
  where statement_id = v_statement;
  v_net := v_net - v_paid;
  if v_net <= 0 then
    raise exception 'SETTLEMENT_ALREADY_PAID';
  end if;
  if exists (
    select 1 from public.settlement_requests
    where statement_id = v_statement and status in ('REQUESTED', 'APPROVED')
  ) then
    raise exception 'SETTLEMENT_REQUEST_ALREADY_EXISTS';
  end if;

  insert into public.settlement_requests (
    statement_id, partner_id, requested_amount,
    bank_name, account_holder, account_number
  )
  values (
    v_statement, p_partner, v_net,
    trim(v_bank.bank_name), trim(v_bank.account_holder), trim(v_bank.account_number)
  )
  returning id into v_request;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_partner, 'PARTNER', 'SETTLEMENT_REQUESTED', 'settlement_request', v_request::text,
    jsonb_build_object(
      'statement_id', v_statement,
      'period_start', p_start,
      'period_end', p_end,
      'gross_amount', (select gross_amount from public.settlement_statements where id = v_statement),
      'platform_fee', (select platform_fee from public.settlement_statements where id = v_statement),
      'requested_amount', v_net
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request,
    'statement_id', v_statement,
    'requested_amount', v_net
  );
end;
$$;

create or replace function public.admin_review_settlement_request(
  p_admin uuid,
  p_request uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.settlement_requests%rowtype;
  v_statement public.settlement_statements%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_decision not in ('APPROVE', 'REJECT')
     or (p_decision = 'REJECT' and length(coalesce(v_reason, '')) < 3) then
    raise exception 'VALIDATION: invalid settlement request decision';
  end if;

  select * into v_request
  from public.settlement_requests
  where id = p_request
  for update;
  if not found then
    raise exception 'NOT_FOUND: settlement request';
  end if;
  if v_request.status <> 'REQUESTED' then
    raise exception 'INVALID_STATE: settlement request has already been reviewed';
  end if;

  select * into v_statement
  from public.settlement_statements
  where id = v_request.statement_id
  for update;
  if not found or v_statement.partner_id <> v_request.partner_id then
    raise exception 'NOT_FOUND: settlement statement';
  end if;

  if p_decision = 'APPROVE' then
    if v_statement.status = 'DRAFT' then
      update public.settlement_statements
      set status = 'CONFIRMED', confirmed_at = now()
      where id = v_statement.id;
    elsif v_statement.status <> 'CONFIRMED' then
      raise exception 'INVALID_STATE: settlement is not payable';
    end if;
    update public.settlement_requests
    set status = 'APPROVED', reviewed_at = now(), reviewed_by = p_admin, rejection_reason = null
    where id = p_request;
  else
    update public.settlement_requests
    set status = 'REJECTED', reviewed_at = now(), reviewed_by = p_admin, rejection_reason = v_reason
    where id = p_request;
  end if;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_admin, 'ADMIN', 'SETTLEMENT_REQUEST_REVIEWED', 'settlement_request', p_request::text,
    jsonb_build_object('decision', p_decision, 'reason', v_reason, 'statement_id', v_statement.id)
  );

  return jsonb_build_object('ok', true, 'request_id', p_request, 'status', case when p_decision = 'APPROVE' then 'APPROVED' else 'REJECTED' end);
end;
$$;

create or replace function public.admin_record_settlement_request_payout(
  p_admin uuid,
  p_request uuid,
  p_ref_no text,
  p_evidence_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.settlement_requests%rowtype;
  v_statement public.settlement_statements%rowtype;
  v_paid numeric;
  v_payout uuid;
  v_ref_no text := nullif(trim(coalesce(p_ref_no, '')), '');
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if length(coalesce(v_ref_no, '')) < 3
     or length(v_ref_no) > 200
     or p_evidence_path is null
     or p_evidence_path !~ ('^' || p_request::text || '/[A-Za-z0-9._-]+$')
     or not exists (
       select 1
       from storage.objects
       where bucket_id = 'ocop-settlement-payout-proofs-v1'
         and name = p_evidence_path
     ) then
    raise exception 'VALIDATION: transfer reference and evidence are required';
  end if;

  select * into v_request
  from public.settlement_requests
  where id = p_request
  for update;
  if not found then
    raise exception 'NOT_FOUND: settlement request';
  end if;
  if v_request.status <> 'APPROVED' then
    raise exception 'INVALID_STATE: settlement request must be approved before payout';
  end if;

  select * into v_statement
  from public.settlement_statements
  where id = v_request.statement_id
  for update;
  if not found or v_statement.partner_id <> v_request.partner_id
     or v_statement.status not in ('CONFIRMED', 'PAID') then
    raise exception 'INVALID_STATE: settlement is not confirmed';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payouts
  where statement_id = v_statement.id;
  if v_request.requested_amount <> v_statement.net_payable - v_paid then
    raise exception 'AMOUNT_MISMATCH: requested balance no longer matches settlement balance';
  end if;

  insert into public.payouts (
    statement_id, partner_id, amount, method, ref_no, transferred_at, recorded_by, evidence_path
  )
  values (
    v_statement.id, v_request.partner_id, v_request.requested_amount,
    'BANK_TRANSFER', v_ref_no, now(), p_admin, p_evidence_path
  )
  returning id into v_payout;

  update public.settlement_statements
  set status = 'PAID'
  where id = v_statement.id;
  update public.settlement_requests
  set status = 'PAID',
      paid_at = now(),
      proof_path = p_evidence_path,
      transfer_reference = v_ref_no
  where id = p_request;

  insert into public.audit_logs (
    actor_id, actor_role, action, entity_type, entity_id, after
  )
  values (
    p_admin, 'ADMIN', 'SETTLEMENT_REQUEST_PAID', 'settlement_request', p_request::text,
    jsonb_build_object(
      'payout_id', v_payout,
      'statement_id', v_statement.id,
      'partner_id', v_request.partner_id,
      'amount', v_request.requested_amount,
      'transfer_reference', v_ref_no,
      'evidence_path', p_evidence_path
    )
  );

  return jsonb_build_object('ok', true, 'request_id', p_request, 'payout_id', v_payout);
end;
$$;

revoke all on function public.partner_request_settlement(uuid, date, date) from public, anon;
grant execute on function public.partner_request_settlement(uuid, date, date) to authenticated;
revoke all on function public.admin_review_settlement_request(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_record_settlement_request_payout(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_settlement_request(uuid, uuid, text, text) to service_role;
grant execute on function public.admin_record_settlement_request_payout(uuid, uuid, text, text) to service_role;
