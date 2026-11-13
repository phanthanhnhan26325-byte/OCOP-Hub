insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ocop-order-return-evidence-v1',
  'ocop-order-return-evidence-v1',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.order_service_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid not null references public.users(id) on delete restrict,
  partner_id uuid not null references public.partner_profiles(user_id) on delete restrict,
  request_type text not null check (request_type in ('CANCELLATION', 'RETURN')),
  status text not null check (status in (
    'CANCELLED', 'REQUESTED', 'APPROVED', 'REJECTED', 'RETURN_SENT', 'RETURN_RECEIVED'
  )),
  reason text not null,
  evidence_path text,
  contact_phone text,
  partner_response text,
  payment_id uuid references public.payments(id) on delete restrict,
  refund_amount numeric(12, 2) not null default 0 check (refund_amount >= 0),
  refund_status text not null default 'NOT_REQUIRED'
    check (refund_status in ('NOT_REQUIRED', 'RESERVED', 'PENDING', 'COMPLETED', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  partner_responded_at timestamptz,
  return_received_at timestamptz,
  constraint ck_order_service_request_evidence check (
    (request_type = 'RETURN' and evidence_path is not null and contact_phone is not null)
    or request_type = 'CANCELLATION'
  ),
  constraint ck_order_service_request_refund check (
    (refund_status = 'NOT_REQUIRED' and refund_amount >= 0)
    or (refund_status <> 'NOT_REQUIRED' and payment_id is not null and refund_amount > 0)
  )
);

create index idx_order_service_requests_order
  on public.order_service_requests(order_id, created_at desc);
create index idx_order_service_requests_partner
  on public.order_service_requests(partner_id, status, created_at desc);
create index idx_order_service_requests_refunds
  on public.order_service_requests(refund_status, created_at)
  where refund_status = 'PENDING';
create index idx_order_service_requests_payment_reservations
  on public.order_service_requests(payment_id)
  where refund_status in ('PENDING', 'RESERVED');
create unique index uq_order_service_request_open
  on public.order_service_requests(order_id)
  where status in ('REQUESTED', 'APPROVED', 'RETURN_SENT');

alter table public.order_service_requests enable row level security;
create policy order_service_requests_select on public.order_service_requests
  for select using (
    customer_id = auth.uid()
    or partner_id = auth.uid()
    or public.is_admin()
  );

create or replace function public.customer_update_order(
  p_customer uuid,
  p_order uuid,
  p_action text,
  p_reason text default null,
  p_evidence_path text default null,
  p_contact_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_request public.order_service_requests%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_phone text := nullif(trim(coalesce(p_contact_phone, '')), '');
  v_refund_status text := 'NOT_REQUIRED';
  v_pending_refunds numeric := 0;
  v_parent_order_id uuid;
  v_payment_found boolean := false;
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_customer and role = 'CUSTOMER'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order
  from public.orders
  where id = p_order
    and customer_id = p_customer
    and order_level = 'CHILD';
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  v_parent_order_id := v_order.parent_order_id;

  if p_action in ('CANCEL', 'REQUEST_RETURN') then
    select * into v_payment
    from public.payments
    where purpose = 'ORDER'
      and reference_id = v_parent_order_id
    order by case
      when status in ('PAID', 'PARTIALLY_REFUNDED') then 0
      when status in ('CREATED', 'PENDING') then 1
      when status = 'REFUNDED' then 2
      else 3
    end, created_at desc
    limit 1
    for update;
    v_payment_found := found;
  end if;

  select * into v_order
  from public.orders
  where id = p_order
    and customer_id = p_customer
    and order_level = 'CHILD'
  for update;
  if not found or v_order.parent_order_id <> v_parent_order_id then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if p_action = 'COMPLETE' then
    if v_order.status <> 'DELIVERED' then
      raise exception 'ORDER_STATE_INVALID: chỉ khách hàng mới xác nhận hoàn thành đơn đã giao';
    end if;
    if exists (
      select 1 from public.order_service_requests
      where order_id = v_order.id
        and request_type = 'RETURN'
        and status in ('REQUESTED', 'APPROVED', 'RETURN_SENT')
    ) then
      raise exception 'ORDER_STATE_INVALID: đơn đang có yêu cầu trả hàng chưa xử lý xong';
    end if;

    update public.orders
    set status = 'COMPLETED', updated_at = now()
    where id = v_order.id;
    insert into public.order_status_history (
      order_id, from_status, to_status, actor_id, actor_role, reason
    )
    values (
      v_order.id, v_order.status, 'COMPLETED', p_customer, 'CUSTOMER',
      'Khách hàng xác nhận đã nhận và hoàn tất đơn hàng.'
    );
    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      v_order.partner_id, 'order_completed', 'Khách hàng xác nhận hoàn thành',
      'Khách hàng đã xác nhận hoàn thành đơn ' || v_order.code || '.',
      'partner_order', v_order.id
    );
    return jsonb_build_object('ok', true, 'status', 'COMPLETED');
  end if;

  if p_action = 'CANCEL' then
    if v_order.status in ('DELIVERED', 'COMPLETED', 'RETURNED', 'CANCELLED', 'REJECTED_BY_PARTNER', 'EXPIRED') then
      raise exception 'ORDER_STATE_INVALID: trạng thái đơn không cho phép hủy';
    end if;
    if exists (
      select 1 from public.order_service_requests
      where order_id = v_order.id
        and status in ('REQUESTED', 'APPROVED', 'RETURN_SENT')
    ) then
      raise exception 'ORDER_STATE_INVALID: đơn đang có yêu cầu xử lý khác';
    end if;

    if v_payment_found then
      if v_payment.status in ('PAID', 'PARTIALLY_REFUNDED') then
        v_refund_status := 'PENDING';
        if v_payment.amount - v_payment.refunded_amount < v_order.total then
          raise exception 'AMOUNT_EXCEEDS: số dư thanh toán còn lại không đủ để hoàn phần đơn';
        end if;
      elsif v_payment.status in ('CREATED', 'PENDING') then
        v_refund_status := 'RESERVED';
      end if;
      select coalesce(sum(refund_amount), 0) into v_pending_refunds
      from public.order_service_requests
      where payment_id = v_payment.id and refund_status in ('PENDING', 'RESERVED');
      if v_refund_status in ('PENDING', 'RESERVED')
         and v_payment.amount - v_payment.refunded_amount - v_pending_refunds < v_order.total then
        raise exception 'AMOUNT_EXCEEDS: các yêu cầu hoàn tiền đang chờ vượt quá số tiền đã thanh toán';
      end if;
    end if;

    insert into public.order_service_requests (
      order_id, customer_id, partner_id, request_type, status, reason,
      payment_id, refund_amount, refund_status
    )
    values (
      v_order.id, p_customer, v_order.partner_id, 'CANCELLATION', 'CANCELLED',
      coalesce(v_reason, 'Khách hàng chủ động hủy đơn hàng.'),
      v_payment.id,
      case when v_payment.id is not null then v_order.total else 0 end,
      v_refund_status
    );

    update public.orders
    set status = 'CANCELLED', updated_at = now()
    where id = v_order.id;
    insert into public.order_status_history (
      order_id, from_status, to_status, actor_id, actor_role, reason
    )
    values (
      v_order.id, v_order.status, 'CANCELLED', p_customer,
      'CUSTOMER', coalesce(v_reason, 'Khách hàng chủ động hủy đơn hàng.')
    );
    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      v_order.partner_id, 'order_cancelled', 'Khách hàng đã hủy đơn',
      'Khách hàng đã hủy phần đơn ' || v_order.code || '.',
      'partner_order', v_order.id
    );
    return jsonb_build_object(
      'ok', true,
      'status', 'CANCELLED',
      'refundStatus', v_refund_status
    );
  end if;

  if p_action = 'REQUEST_RETURN' then
    if v_order.status <> 'DELIVERED' then
      raise exception 'ORDER_STATE_INVALID: chỉ có thể yêu cầu trả hàng cho đơn đã giao';
    end if;
    if length(coalesce(v_reason, '')) < 3 or length(coalesce(p_evidence_path, '')) = 0
       or length(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g')) not between 8 and 15 then
      raise exception 'VALIDATION: cần nhập lý do, ảnh tình trạng hàng và số điện thoại hợp lệ';
    end if;
    if exists (
      select 1 from public.order_service_requests
      where order_id = v_order.id
        and request_type = 'RETURN'
        and status in ('REQUESTED', 'APPROVED', 'RETURN_SENT')
    ) then
      raise exception 'ORDER_STATE_INVALID: đơn đã có yêu cầu trả hàng đang xử lý';
    end if;

    if v_payment_found and v_payment.status in ('PAID', 'PARTIALLY_REFUNDED', 'CREATED', 'PENDING') then
      v_refund_status := 'RESERVED';
      if v_payment.status in ('PAID', 'PARTIALLY_REFUNDED')
         and v_payment.amount - v_payment.refunded_amount < v_order.total then
        raise exception 'AMOUNT_EXCEEDS: số dư thanh toán còn lại không đủ để hoàn phần đơn';
      end if;
      select coalesce(sum(refund_amount), 0) into v_pending_refunds
      from public.order_service_requests
      where payment_id = v_payment.id and refund_status in ('PENDING', 'RESERVED');
      if v_payment.amount - v_payment.refunded_amount - v_pending_refunds < v_order.total then
        raise exception 'AMOUNT_EXCEEDS: các yêu cầu hoàn tiền đang chờ vượt quá số tiền đã thanh toán';
      end if;
    end if;

    insert into public.order_service_requests (
      order_id, customer_id, partner_id, request_type, status, reason,
      evidence_path, contact_phone, payment_id, refund_amount, refund_status
    )
    values (
      v_order.id, p_customer, v_order.partner_id, 'RETURN', 'REQUESTED',
      v_reason, p_evidence_path, v_phone, v_payment.id,
      case when v_payment.id is not null then v_order.total else 0 end,
      v_refund_status
    )
    returning * into v_request;
    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      v_order.partner_id, 'order_return_requested', 'Có yêu cầu trả hàng mới',
      'Khách hàng gửi yêu cầu trả hàng cho đơn ' || v_order.code || '.',
      'partner_order', v_order.id
    );
    return jsonb_build_object('ok', true, 'requestId', v_request.id, 'status', v_request.status);
  end if;

  if p_action = 'RETURN_SENT' then
    if v_order.status <> 'DELIVERED' then
      raise exception 'ORDER_STATE_INVALID: đơn không còn ở trạng thái chờ trả hàng';
    end if;
    select * into v_request
    from public.order_service_requests
    where order_id = v_order.id
      and customer_id = p_customer
      and request_type = 'RETURN'
      and status = 'APPROVED'
    order by created_at desc
    limit 1
    for update;
    if not found then
      raise exception 'RETURN_REQUEST_INVALID: doanh nghiệp chưa chấp thuận yêu cầu trả hàng';
    end if;

    update public.order_service_requests
    set status = 'RETURN_SENT', updated_at = now()
    where id = v_request.id;
    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      v_order.partner_id, 'order_return_sent', 'Khách đã gửi trả hàng',
      'Khách hàng đã gửi hàng trả cho đơn ' || v_order.code || '.',
      'partner_order', v_order.id
    );
    return jsonb_build_object('ok', true, 'requestId', v_request.id, 'status', 'RETURN_SENT');
  end if;

  raise exception 'VALIDATION: thao tác đơn hàng không hợp lệ';
end;
$$;

create or replace function public.partner_update_order_return(
  p_partner uuid,
  p_order uuid,
  p_request uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_request public.order_service_requests%rowtype;
  v_payment public.payments%rowtype;
  v_response text := nullif(trim(coalesce(p_reason, '')), '');
  v_pending_refunds numeric := 0;
  v_refund_status text := 'NOT_REQUIRED';
  v_payment_found boolean := false;
begin
  if not exists (
    select 1 from public.user_roles ur
    join public.partner_profiles pp on pp.user_id = ur.user_id
    where ur.user_id = p_partner
      and ur.role = 'PARTNER'
      and pp.selling_status = 'APPROVED'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_order
  from public.orders
  where id = p_order
    and partner_id = p_partner
    and order_level = 'CHILD';
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if p_action = 'RECEIVE_RETURN' then
    select * into v_request
    from public.order_service_requests
    where id = p_request
      and order_id = v_order.id
      and partner_id = p_partner
      and request_type = 'RETURN';
    if not found then
      raise exception 'RETURN_REQUEST_NOT_FOUND';
    end if;
    if v_request.payment_id is not null then
      select * into v_payment
      from public.payments
      where id = v_request.payment_id
      for update;
      v_payment_found := found;
    end if;
  end if;

  select * into v_order
  from public.orders
  where id = p_order
    and partner_id = p_partner
    and order_level = 'CHILD'
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_order.status <> 'DELIVERED' then
    raise exception 'ORDER_STATE_INVALID: chỉ xử lý yêu cầu trả hàng cho đơn đã giao';
  end if;

  select * into v_request
  from public.order_service_requests
  where id = p_request
    and order_id = v_order.id
    and partner_id = p_partner
    and request_type = 'RETURN'
  for update;
  if not found then
    raise exception 'RETURN_REQUEST_NOT_FOUND';
  end if;

  if p_action = 'APPROVE' or p_action = 'REJECT' then
    if v_request.status <> 'REQUESTED' then
      raise exception 'RETURN_REQUEST_INVALID: yêu cầu đã được xử lý';
    end if;
    if p_action = 'REJECT' and length(coalesce(v_response, '')) < 3 then
      raise exception 'VALIDATION: cần nhập lý do từ chối ít nhất 3 ký tự';
    end if;
    update public.order_service_requests
    set status = case when p_action = 'APPROVE' then 'APPROVED' else 'REJECTED' end,
        refund_status = case when p_action = 'REJECT' then 'NOT_REQUIRED' else refund_status end,
        partner_response = v_response,
        partner_responded_at = now(),
        updated_at = now()
    where id = v_request.id;
    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      v_order.customer_id,
      case when p_action = 'APPROVE' then 'order_return_approved' else 'order_return_rejected' end,
      case when p_action = 'APPROVE' then 'Doanh nghiệp đồng ý nhận trả hàng' else 'Doanh nghiệp từ chối yêu cầu trả hàng' end,
      'Đơn ' || v_order.code || case
        when p_action = 'APPROVE' then ' đã được chấp thuận trả hàng.'
        else ' chưa được chấp thuận. Lý do: ' || coalesce(v_response, '')
      end,
      'order', v_order.parent_order_id
    );
    return jsonb_build_object(
      'ok', true,
      'status', case when p_action = 'APPROVE' then 'APPROVED' else 'REJECTED' end
    );
  end if;

  if p_action = 'RECEIVE_RETURN' then
    if v_request.status <> 'RETURN_SENT' then
      raise exception 'RETURN_REQUEST_INVALID: khách hàng chưa xác nhận đã gửi trả hàng';
    end if;
    if v_payment_found then
      if v_payment.status in ('PAID', 'PARTIALLY_REFUNDED') then
        select coalesce(sum(refund_amount), 0) into v_pending_refunds
        from public.order_service_requests
        where payment_id = v_payment.id
          and refund_status in ('PENDING', 'RESERVED')
          and id <> v_request.id;
        if v_payment.amount - v_payment.refunded_amount - v_pending_refunds < v_request.refund_amount then
          raise exception 'AMOUNT_EXCEEDS: các yêu cầu hoàn tiền đang chờ vượt quá số tiền đã thanh toán';
        end if;
        v_refund_status := 'PENDING';
      elsif v_payment.status in ('CREATED', 'PENDING') then
        v_refund_status := 'RESERVED';
      end if;
    end if;
    update public.order_service_requests
    set status = 'RETURN_RECEIVED', refund_status = v_refund_status,
        return_received_at = now(), updated_at = now()
    where id = v_request.id;
    update public.orders
    set status = 'RETURNED', updated_at = now()
    where id = v_order.id;
    insert into public.order_status_history (
      order_id, from_status, to_status, actor_id, actor_role, reason
    )
    values (
      v_order.id, v_order.status, 'RETURNED', p_partner, 'PARTNER',
      coalesce(v_response, 'Doanh nghiệp xác nhận đã nhận lại hàng.')
    );
    return jsonb_build_object('ok', true, 'status', 'RETURN_RECEIVED');
  end if;

  raise exception 'VALIDATION: thao tác trả hàng không hợp lệ';
end;
$$;

create or replace function public.mark_order_service_refund_complete(
  p_admin uuid,
  p_request uuid,
  p_transfer_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.order_service_requests%rowtype;
  v_payment public.payments%rowtype;
  v_refund_id uuid;
  v_reference text := nullif(trim(coalesce(p_transfer_reference, '')), '');
  v_refunded numeric;
begin
  if not exists (
    select 1 from public.user_roles where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if length(coalesce(v_reference, '')) < 3 then
    raise exception 'VALIDATION: mã tham chiếu chuyển khoản không hợp lệ';
  end if;

  select * into v_request
  from public.order_service_requests
  where id = p_request;
  if not found then
    raise exception 'RETURN_REQUEST_NOT_FOUND';
  end if;

  if v_request.payment_id is null then
    raise exception 'INVALID_STATE: yêu cầu không có giao dịch cần hoàn';
  end if;
  select * into v_payment
  from public.payments
  where id = v_request.payment_id
  for update;
  if not found then
    raise exception 'INVALID_STATE: không tìm thấy giao dịch cần hoàn';
  end if;

  select * into v_request
  from public.order_service_requests
  where id = p_request
  for update;
  if not found then
    raise exception 'RETURN_REQUEST_NOT_FOUND';
  end if;
  if v_request.refund_status <> 'PENDING'
     or v_request.payment_id <> v_payment.id
     or v_request.refund_amount <= 0
     or (v_request.request_type = 'RETURN' and v_request.status <> 'RETURN_RECEIVED')
     or (v_request.request_type = 'CANCELLATION' and v_request.status <> 'CANCELLED') then
    raise exception 'INVALID_STATE: yêu cầu không chờ hoàn tiền';
  end if;

  if v_payment.status not in ('PAID', 'PARTIALLY_REFUNDED')
     or v_payment.business_sync_status <> 'SYNCED' then
    raise exception 'INVALID_STATE: khoản thanh toán chưa sẵn sàng để hoàn tiền';
  end if;
  v_refunded := v_payment.refunded_amount + v_request.refund_amount;
  if v_refunded > v_payment.amount then
    raise exception 'AMOUNT_EXCEEDS: tổng tiền hoàn vượt quá khoản đã thanh toán';
  end if;

  update public.order_service_requests
  set refund_status = 'COMPLETED', updated_at = now()
  where id = v_request.id;

  insert into public.refunds (
    payment_id, ref_type, ref_id, amount, reason, status,
    provider_refund_id, requested_by, confirmed_at, updated_at
  )
  values (
    v_payment.id, v_request.request_type, v_request.order_id,
    v_request.refund_amount, v_request.reason, 'COMPLETED',
    'MANUAL:' || v_payment.id::text || ':' || v_request.id::text || ':' || v_reference,
    p_admin, now(), now()
  )
  returning id into v_refund_id;

  insert into public.payment_transactions (
    payment_id, type, provider, provider_txn_id, amount, status, response
  )
  values (
    v_payment.id, 'REFUND', 'MANUAL',
    'MANUAL:' || v_payment.id::text || ':' || v_request.id::text || ':' || v_reference,
    v_request.refund_amount, 'SUCCESS',
    jsonb_build_object('transfer_reference', v_reference, 'recorded_by', p_admin)
  );

  update public.payments
  set refunded_amount = v_refunded,
      status = case when v_refunded = amount then 'REFUNDED'::public.payment_status
        else 'PARTIALLY_REFUNDED'::public.payment_status end,
      updated_at = now()
  where id = v_payment.id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'ORDER_SERVICE_REFUND_RECORDED', 'order_service_request', v_request.id::text,
    jsonb_build_object(
      'order_id', v_request.order_id,
      'refund_id', v_refund_id,
      'amount', v_request.refund_amount,
      'transfer_reference', v_reference
    )
  );

  return jsonb_build_object('ok', true, 'refund_id', v_refund_id);
end;
$$;

create or replace function public.activate_order_service_refunds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purpose = 'ORDER'
     and new.status in ('PAID', 'PARTIALLY_REFUNDED')
     and old.status not in ('PAID', 'PARTIALLY_REFUNDED') then
    update public.order_service_requests as service_request
    set payment_id = new.id, refund_status = 'PENDING', updated_at = now()
    from public.orders child_order
    where child_order.id = service_request.order_id
      and child_order.parent_order_id = new.reference_id
      and service_request.refund_status in ('NOT_REQUIRED', 'RESERVED')
      and service_request.refund_amount > 0
      and (
        (service_request.request_type = 'CANCELLATION' and service_request.status = 'CANCELLED')
        or (service_request.request_type = 'RETURN' and service_request.status = 'RETURN_RECEIVED')
      );
  elsif new.purpose = 'ORDER'
     and new.status in ('FAILED', 'EXPIRED', 'CANCELLED')
     and old.status in ('CREATED', 'PENDING') then
    update public.order_service_requests
    set payment_id = null, refund_status = 'NOT_REQUIRED', updated_at = now()
    where payment_id = new.id
      and refund_status = 'RESERVED'
      and (
        (request_type = 'CANCELLATION' and status = 'CANCELLED')
        or (request_type = 'RETURN' and status = 'RETURN_RECEIVED')
      );
  end if;
  return new;
end;
$$;

create trigger sync_order_service_refund_reservations
  after update of status on public.payments
  for each row
  when (old.status is distinct from new.status)
  execute function public.activate_order_service_refunds();

revoke all on function public.customer_update_order(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.customer_update_order(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.partner_update_order_return(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.partner_update_order_return(uuid, uuid, uuid, text, text) to service_role;
revoke all on function public.mark_order_service_refund_complete(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.mark_order_service_refund_complete(uuid, uuid, text) to service_role;
revoke all on function public.activate_order_service_refunds() from public, anon, authenticated;

create or replace function public.protect_reserved_order_refunds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_reserved numeric := 0;
begin
  if new.status <> 'COMPLETED' then
    return new;
  end if;
  select * into v_payment
  from public.payments
  where id = new.payment_id
  for update;
  if not found or v_payment.purpose <> 'ORDER' then
    return new;
  end if;

  select coalesce(sum(refund_amount), 0) into v_reserved
  from public.order_service_requests
  where payment_id = new.payment_id
    and refund_status in ('PENDING', 'RESERVED');
  if v_payment.refunded_amount + v_reserved + new.amount > v_payment.amount then
    raise exception 'AMOUNT_EXCEEDS: khoản hoàn sẽ sử dụng số tiền đã được giữ cho yêu cầu khác';
  end if;
  return new;
end;
$$;

create trigger protect_reserved_order_refunds
  before insert on public.refunds
  for each row
  execute function public.protect_reserved_order_refunds();
revoke all on function public.protect_reserved_order_refunds() from public, anon, authenticated;
