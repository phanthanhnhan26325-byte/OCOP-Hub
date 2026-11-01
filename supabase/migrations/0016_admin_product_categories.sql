create or replace function public.admin_save_product_category(
  p_admin uuid,
  p_category uuid,
  p_name text,
  p_slug text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = p_admin and role = 'ADMIN'
  ) then
    raise exception 'FORBIDDEN';
  end if;
  if length(coalesce(v_name, '')) < 2
     or v_slug is null
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or p_status is null
     or p_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'VALIDATION: invalid product category';
  end if;

  if p_category is null then
    insert into public.product_categories (name, slug, status)
    values (v_name, v_slug, p_status)
    returning id into v_id;
  else
    update public.product_categories
    set name = v_name, slug = v_slug, status = p_status
    where id = p_category
    returning id into v_id;
    if not found then
      raise exception 'NOT_FOUND: product category';
    end if;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, after)
  values (
    p_admin, 'ADMIN', 'PRODUCT_CATEGORY_SAVED', 'product_category', v_id::text,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'status', p_status)
  );
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.admin_save_product_category(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_save_product_category(uuid, uuid, text, text, text) to service_role;
