-- Product creation, submission, review, and visibility for the authenticated app.
drop policy if exists products_insert_partner on public.products;
create policy products_insert_partner on public.products for insert to authenticated
  with check (
    partner_id = auth.uid()
    and public.is_partner_approved()
    and status = 'DRAFT'
  );

drop policy if exists products_update_partner on public.products;
create policy products_update_partner on public.products for update to authenticated
  using (partner_id = auth.uid() and public.is_partner_approved())
  with check (
    partner_id = auth.uid()
    and public.is_partner_approved()
    and status in ('DRAFT', 'PENDING', 'REJECTED')
  );

drop policy if exists products_update_admin on public.products;
create policy products_update_admin on public.products for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists products_delete_partner on public.products;
create policy products_delete_partner on public.products for delete to authenticated
  using (partner_id = auth.uid() and public.is_partner_approved());

drop policy if exists product_images_select on public.product_images;
create policy product_images_select on public.product_images for select
  using (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and (p.status = 'APPROVED' or p.partner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists product_images_insert_partner on public.product_images;
create policy product_images_insert_partner on public.product_images for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.partner_id = auth.uid()
        and public.is_partner_approved()
    )
  );

drop policy if exists availability_insert_partner on public.product_availability;
create policy availability_insert_partner on public.product_availability for insert to authenticated
  with check (
    exists (
      select 1 from public.products p
      where p.id = product_id
        and p.partner_id = auth.uid()
        and public.is_partner_approved()
    )
  );

drop policy if exists audit_insert_admin on public.audit_logs;
create policy audit_insert_admin on public.audit_logs for insert to authenticated
  with check (public.is_admin());
