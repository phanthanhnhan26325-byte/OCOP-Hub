-- Let approved partners submit products and workshops with one action.
drop policy if exists products_insert_partner on public.products;
create policy products_insert_partner on public.products for insert to authenticated
  with check (
    partner_id = auth.uid()
    and public.is_partner_approved()
    and status = 'DRAFT'
  );

drop policy if exists workshops_insert_partner on public.workshops;
create policy workshops_insert_partner on public.workshops for insert to authenticated
  with check (
    partner_id = auth.uid()
    and public.is_partner_approved()
    and status = 'DRAFT'
  );

drop policy if exists workshops_update_partner on public.workshops;
create policy workshops_update_partner on public.workshops for update to authenticated
  using (partner_id = auth.uid() and public.is_partner_approved())
  with check (
    partner_id = auth.uid()
    and public.is_partner_approved()
    and status in ('DRAFT', 'PENDING', 'REJECTED')
  );

drop policy if exists workshops_update_admin on public.workshops;
create policy workshops_update_admin on public.workshops for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists workshops_delete_partner on public.workshops;
create policy workshops_delete_partner on public.workshops for delete to authenticated
  using (partner_id = auth.uid() and public.is_partner_approved());

drop policy if exists sessions_insert_partner on public.workshop_sessions;
create policy sessions_insert_partner on public.workshop_sessions for insert to authenticated
  with check (
    status = 'SCHEDULED'
    and exists (
      select 1 from public.workshops w
      where w.id = workshop_id
        and w.partner_id = auth.uid()
        and public.is_partner_approved()
    )
  );

drop policy if exists sessions_update_partner on public.workshop_sessions;
create policy sessions_update_partner on public.workshop_sessions for update to authenticated
  using (
    exists (
      select 1 from public.workshops w
      where w.id = workshop_id
        and w.partner_id = auth.uid()
        and public.is_partner_approved()
    )
  )
  with check (
    exists (
      select 1 from public.workshops w
      where w.id = workshop_id
        and (w.partner_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists sessions_update_admin on public.workshop_sessions;
create policy sessions_update_admin on public.workshop_sessions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.notify_admins(
  p_type text,
  p_title text,
  p_body text,
  p_ref_type text,
  p_ref_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
  select user_id, p_type, p_title, p_body, p_ref_type, p_ref_id
  from public.user_roles
  where role = 'ADMIN';
$$;

revoke all on function public.notify_admins(text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.notify_partner_review_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_label text;
  entity_type text;
begin
  if new.status is distinct from old.status
     and new.status in ('APPROVED', 'REJECTED') then
    if tg_table_name = 'products' then
      entity_label := 'Sản phẩm "' || new.name || '"';
      entity_type := 'product';
    else
      entity_label := 'Workshop "' || new.title || '"';
      entity_type := 'workshop';
    end if;

    insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
    values (
      new.partner_id,
      entity_type || '_' || lower(new.status::text),
      case when new.status = 'APPROVED' then 'Nội dung đã được phê duyệt' else 'Nội dung chưa được phê duyệt' end,
      entity_label || case
        when new.status = 'APPROVED' then ' đã được phê duyệt.'
        else ' bị từ chối.' || case when coalesce(new.reject_reason, '') = '' then '' else ' Lý do: ' || new.reject_reason end
      end,
      entity_type,
      new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_admins_of_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entity_label text;
  entity_type text;
begin
  if tg_table_name = 'products' then
    entity_label := new.name;
    entity_type := 'product';
  else
    entity_label := new.title;
    entity_type := 'workshop';
  end if;

  perform public.notify_admins(
    entity_type || '_review_request',
    'Có yêu cầu phê duyệt mới',
    'Doanh nghiệp gửi ' || entity_type || ': ' || entity_label,
    entity_type,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists product_submission_notification on public.products;
create trigger product_submission_notification
  after update of status on public.products
  for each row
  when (new.status = 'PENDING' and old.status is distinct from new.status)
  execute function public.notify_admins_of_submission();

drop trigger if exists product_review_notification on public.products;
create trigger product_review_notification
  after update of status on public.products
  for each row
  when (new.status in ('APPROVED', 'REJECTED') and old.status is distinct from new.status)
  execute function public.notify_partner_review_result();

drop trigger if exists workshop_submission_notification on public.workshops;
create trigger workshop_submission_notification
  after update of status on public.workshops
  for each row
  when (new.status = 'PENDING' and old.status is distinct from new.status)
  execute function public.notify_admins_of_submission();

drop trigger if exists workshop_review_notification on public.workshops;
create trigger workshop_review_notification
  after update of status on public.workshops
  for each row
  when (new.status in ('APPROVED', 'REJECTED') and old.status is distinct from new.status)
  execute function public.notify_partner_review_result();

create or replace function public.notify_order_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  order_label text;
begin
  if tg_op = 'INSERT' then
    if new.order_level = 'PARENT' then
      insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
      values (
        new.customer_id,
        'order_placed',
        'Đặt hàng thành công',
        'Đơn hàng ' || new.code || ' đã được tạo và đang chờ thanh toán.',
        'order',
        new.id
      );
      perform public.notify_admins(
        'order_placed',
        'Có đơn hàng mới',
        'Đơn hàng ' || new.code || ' vừa được tạo.',
        'order',
        new.id
      );
    elsif new.order_level = 'CHILD' then
      insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
      values (
        new.partner_id,
        'order_new',
        'Có đơn hàng mới',
        'Bạn có đơn hàng mới ' || new.code || ' cần xử lý.',
        'partner_order',
        new.id
      );
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.order_level = 'PARENT' then
      order_label := 'Đơn hàng ' || new.code;
      insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
      values (
        new.customer_id,
        'order_status',
        'Cập nhật đơn hàng',
        order_label || ' được cập nhật trạng thái: ' || new.status || '.',
        'order',
        new.id
      );
    elsif new.order_level = 'CHILD' then
      order_label := 'Đơn hàng ' || new.code;
      insert into public.notifications (user_id, type, title, body, ref_type, ref_id)
      values (
        new.customer_id,
        'order_status',
        'Cập nhật đơn hàng',
        order_label || ' được cập nhật trạng thái: ' || new.status || '.',
        'order',
        coalesce(new.parent_order_id, new.id)
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists order_activity_notification on public.orders;
create trigger order_activity_notification
  after insert or update of status on public.orders
  for each row
  execute function public.notify_order_activity();
