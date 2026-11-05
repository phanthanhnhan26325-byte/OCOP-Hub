-- Called only by the authenticated server route after validating the complete form.
-- Keep related changes and the submission notification in one transaction.
create or replace function public.partner_resubmit_product(p_product uuid, p_partner uuid, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_variant jsonb;
begin
  if not exists (select 1 from public.partner_profiles where user_id = p_partner and selling_status = 'APPROVED')
     or not exists (select 1 from public.user_roles where user_id = p_partner and role = 'PARTNER') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_product from public.products where id = p_product and partner_id = p_partner for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_product.status not in ('DRAFT', 'REJECTED') then
    raise exception 'INVALID_STATE: Chỉ có thể sửa sản phẩm nháp hoặc bị từ chối';
  end if;
  if not exists (select 1 from public.product_categories where id = (p_data->>'categoryId')::uuid and status = 'ACTIVE') then
    raise exception 'VALIDATION: Vui lòng chọn danh mục đang hoạt động';
  end if;
  for v_variant in select value from jsonb_array_elements(p_data->'variants') loop
    if v_variant->>'id' is not null and not exists (
      select 1 from public.product_variants where id = (v_variant->>'id')::uuid and product_id = p_product
    ) then raise exception 'VALIDATION: Biến thể không thuộc sản phẩm'; end if;
  end loop;

  -- Preserve variant IDs referenced by carts; all failures roll back the entire edit.
  delete from public.product_variants pv where pv.product_id = p_product and not exists (
    select 1 from jsonb_array_elements(p_data->'variants') v where (v->>'id')::uuid = pv.id
  );
  -- Temporarily clear labels to allow swapping labels without unique conflicts.
  update public.product_variants set label = id::text where product_id = p_product;
  for v_variant in select value from jsonb_array_elements(p_data->'variants') loop
    if v_variant->>'id' is null then
      insert into public.product_variants(product_id, label, price)
      values(p_product, v_variant->>'label', (v_variant->>'price')::numeric);
    else
      update public.product_variants set label = v_variant->>'label', price = (v_variant->>'price')::numeric
      where id = (v_variant->>'id')::uuid and product_id = p_product;
    end if;
  end loop;
  delete from public.product_images where product_id = p_product;
  insert into public.product_images(product_id, url, sort_order)
    select p_product, value, (ordinality - 1)::int from jsonb_array_elements_text(p_data->'images') with ordinality;
  update public.products set
    name = p_data->>'name', slug = p_data->>'slug', category_id = (p_data->>'categoryId')::uuid,
    short_description = coalesce(p_data->>'shortDescription', ''), description = coalesce(p_data->>'description', ''),
    price = case when jsonb_array_length(p_data->'variants') > 0 then
      (select min((v->>'price')::numeric) from jsonb_array_elements(p_data->'variants') v)
      else (p_data->>'price')::numeric end,
    ocop_cert_no = nullif(p_data->>'ocopCertNo', ''), reject_reason = null,
    status = 'PENDING', updated_at = now()
  where id = p_product;
end;
$$;

revoke all on function public.partner_resubmit_product(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.partner_resubmit_product(uuid, uuid, jsonb) to service_role;
