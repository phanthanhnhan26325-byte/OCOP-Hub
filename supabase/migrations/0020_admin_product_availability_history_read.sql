drop policy if exists availability_history_select_admin
  on public.product_availability_history;

create policy availability_history_select_admin
on public.product_availability_history
for select
to authenticated
using (public.is_admin());
