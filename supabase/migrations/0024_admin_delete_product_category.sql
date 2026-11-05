create or replace function public.admin_delete_product_category(
  p_admin uuid,
  p_category uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category public.product_categories%rowtype;
  v_product_count integer;
begin
  if not exists (
    select 1
    from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;

  select *
  into v_category
  from public.product_categories
  where id = p_category
  for update;

  if not found then
    raise exception 'NOT_FOUND: product category';
  end if;

  select count(*)::integer
  into v_product_count
  from public.products
  where category_id = p_category;

  delete from public.product_categories
  where id = p_category;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    before
  )
  values (
    p_admin,
    'ADMIN',
    'PRODUCT_CATEGORY_DELETED',
    'product_category',
    p_category::text,
    jsonb_build_object(
      'name', v_category.name,
      'slug', v_category.slug,
      'status', v_category.status,
      'product_count', v_product_count
    )
  );

  return jsonb_build_object('ok', true, 'id', p_category);
end;
$$;

revoke all on function public.admin_delete_product_category(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_product_category(uuid, uuid) to service_role;
