create or replace function public.admin_record_manual_refund(
  p_admin uuid,
  p_payment uuid,
  p_amount numeric,
  p_reason text,
  p_transfer_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_refund_id uuid;
  v_reference text := nullif(trim(coalesce(p_transfer_reference, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_refunded numeric;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if p_amount is null
     or p_amount <= 0
     or p_amount <> trunc(p_amount)
     or length(coalesce(v_reason, '')) < 3
     or length(coalesce(v_reference, '')) < 3 then
    raise exception 'VALIDATION: invalid manual refund';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment
  for update;
  if not found then
    raise exception 'NOT_FOUND: payment';
  end if;
  if v_payment.status not in ('PAID', 'PARTIALLY_REFUNDED')
     or v_payment.business_sync_status <> 'SYNCED' then
    raise exception 'INVALID_STATE: payment is not eligible for refund';
  end if;

  v_refunded := v_payment.refunded_amount + p_amount;
  if v_refunded > v_payment.amount then
    raise exception 'AMOUNT_EXCEEDS';
  end if;

  insert into public.refunds (
    payment_id, ref_type, ref_id, amount, reason, status,
    provider_refund_id, requested_by, confirmed_at, updated_at
  )
  values (
    v_payment.id, v_payment.purpose::text, v_payment.reference_id,
    p_amount, v_reason, 'COMPLETED',
    'MANUAL:' || v_payment.id::text || ':' || v_reference,
    p_admin, now(), now()
  )
  returning id into v_refund_id;

  insert into public.payment_transactions (
    payment_id, type, provider, provider_txn_id, amount, status, response
  )
  values (
    v_payment.id, 'REFUND', 'MANUAL',
    'MANUAL:' || v_payment.id::text || ':' || v_reference,
    p_amount, 'SUCCESS',
    jsonb_build_object('transfer_reference', v_reference, 'recorded_by', p_admin)
  );

  update public.payments
  set refunded_amount = v_refunded,
      status = case when v_refunded = amount then 'REFUNDED'::payment_status else 'PARTIALLY_REFUNDED'::payment_status end,
      updated_at = now()
  where id = v_payment.id;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'MANUAL_REFUND_RECORDED', 'payment', v_payment.id::text,
    jsonb_build_object(
      'refund_id', v_refund_id,
      'amount', p_amount,
      'transfer_reference', v_reference,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'ok', true,
    'refund_id', v_refund_id,
    'refunded_total', v_refunded,
    'remaining', v_payment.amount - v_refunded
  );
end;
$$;

revoke all on function public.admin_record_manual_refund(uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.admin_record_manual_refund(uuid, uuid, numeric, text, text) to service_role;
