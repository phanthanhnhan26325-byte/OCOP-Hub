alter table public.users
  add column if not exists default_shipping_address jsonb not null default '{}'::jsonb;

grant update (phone) on public.users to authenticated;

create or replace function public.remember_customer_checkout_address()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_address text;
begin
  if new.order_level = 'PARENT' then
    v_address := concat_ws(
      ', ',
      nullif(trim(new.shipping_address->>'address'), ''),
      nullif(trim(new.shipping_address->>'ward'), ''),
      nullif(trim(new.shipping_address->>'city'), '')
    );
    update public.users
    set phone = nullif(trim(new.shipping_address->>'phone'), ''),
        default_shipping_address = new.shipping_address,
        address = nullif(v_address, ''),
        updated_at = now()
    where id = new.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists remember_customer_checkout_address on public.orders;
create trigger remember_customer_checkout_address
  after insert on public.orders
  for each row
  when (new.order_level = 'PARENT')
  execute function public.remember_customer_checkout_address();

revoke all on function public.remember_customer_checkout_address() from public, anon, authenticated;
