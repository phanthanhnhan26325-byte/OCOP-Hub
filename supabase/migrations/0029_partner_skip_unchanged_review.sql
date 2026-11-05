-- Preserve status and avoid review notifications when editable content is unchanged.
-- Allow editing products in all statuses; edits are submitted for review.
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
  -- A no-op must not update status or fire review notifications.
  if v_product.name is not distinct from p_data->>'name'
    and v_product.slug is not distinct from p_data->>'slug'
    and coalesce(v_product.short_description, '') = coalesce(p_data->>'shortDescription', '')
    and coalesce(v_product.description, '') = coalesce(p_data->>'description', '')
    and v_product.category_id is not distinct from (p_data->>'categoryId')::uuid
    and coalesce(v_product.ocop_cert_no, '') = coalesce(p_data->>'ocopCertNo', '')
    and v_product.price = (case when jsonb_array_length(p_data->'variants') > 0 then
      (select min((v->>'price')::numeric) from jsonb_array_elements(p_data->'variants') v)
      else (p_data->>'price')::numeric end)
    and coalesce((select jsonb_agg(url order by sort_order, id) from public.product_images where product_id = p_product), '[]'::jsonb) = p_data->'images'
    and coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', label, 'price', price) order by id) from public.product_variants where product_id = p_product), '[]'::jsonb)
      = coalesce((select jsonb_agg(jsonb_build_object('id', (v->>'id')::uuid, 'label', v->>'label', 'price', (v->>'price')::numeric) order by (v->>'id')::uuid) from jsonb_array_elements(p_data->'variants') v), '[]'::jsonb)
  then return; end if;
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

-- Allow editing while preserving existing sessions and reserved seats.
-- Server-only transaction; validate the form in the authenticated PATCH route.
create or replace function public.partner_resubmit_workshop(p_workshop uuid, p_partner uuid, p_data jsonb)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_workshop public.workshops%rowtype;
  v_session public.workshop_sessions%rowtype;
  v_input jsonb;
begin
  if not exists (select 1 from public.partner_profiles where user_id = p_partner and selling_status = 'APPROVED')
     or not exists (select 1 from public.user_roles where user_id = p_partner and role = 'PARTNER') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_workshop from public.workshops where id = p_workshop and partner_id = p_partner for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform 1 from public.workshop_sessions where workshop_id = p_workshop order by id for update;
  -- Compare only editable fields, ignoring registration and availability changes.
  if v_workshop.title is not distinct from p_data->>'title'
    and coalesce(v_workshop.description, '') = coalesce(p_data->>'description', '')
    and coalesce(v_workshop.experience_content, '') = coalesce(p_data->>'experienceContent', '')
    and coalesce(v_workshop.cover_image, '') = coalesce(p_data->>'coverImage', '')
    and (select count(*) from public.workshop_sessions where workshop_id = p_workshop) = jsonb_array_length(p_data->'sessions')
    and not exists (
      select 1 from jsonb_array_elements(p_data->'sessions') i
      where not exists (
        select 1 from public.workshop_sessions s where s.workshop_id = p_workshop and s.id = (i->>'id')::uuid
          and date_trunc('minute', s.starts_at) = (i->>'startsAt')::timestamptz
          and date_trunc('minute', s.ends_at) = (i->>'endsAt')::timestamptz
          and s.location = i->>'location' and s.fee = (i->>'fee')::numeric and s.capacity = (i->>'capacity')::int
      )
    )
  then return; end if;
  -- Locks above serialize removal with registrations that reserve seats.
  if exists (
    select 1 from public.workshop_sessions s
    where s.workshop_id = p_workshop
      and not exists (select 1 from jsonb_array_elements(p_data->'sessions') i where (i->>'id')::uuid = s.id)
      and exists (select 1 from public.workshop_registrations r where r.session_id = s.id)
  ) then
    raise exception 'INVALID_STATE: Không thể xóa buổi đã có khách hàng đăng ký tham gia';
  end if;
  delete from public.workshop_sessions s
  where s.workshop_id = p_workshop
    and not exists (select 1 from jsonb_array_elements(p_data->'sessions') i where (i->>'id')::uuid = s.id);
  for v_input in select value from jsonb_array_elements(p_data->'sessions') loop
    if v_input->>'id' is null then
      insert into public.workshop_sessions(workshop_id, starts_at, ends_at, location, fee, capacity, remaining_seats, status)
      values(p_workshop, (v_input->>'startsAt')::timestamptz, (v_input->>'endsAt')::timestamptz,
        v_input->>'location', (v_input->>'fee')::numeric, (v_input->>'capacity')::int, (v_input->>'capacity')::int, 'SCHEDULED');
    else
      select * into v_session from public.workshop_sessions where id = (v_input->>'id')::uuid and workshop_id = p_workshop;
      if not found then raise exception 'VALIDATION: Buổi tổ chức không thuộc workshop'; end if;
      if (v_input->>'capacity')::int < v_session.capacity - v_session.remaining_seats then
        raise exception 'VALIDATION: Sức chứa thấp hơn số chỗ đã được giữ';
      end if;
      update public.workshop_sessions set
        starts_at = (v_input->>'startsAt')::timestamptz, ends_at = (v_input->>'endsAt')::timestamptz,
        location = v_input->>'location', fee = (v_input->>'fee')::numeric,
        capacity = (v_input->>'capacity')::int,
        remaining_seats = (v_input->>'capacity')::int - (v_session.capacity - v_session.remaining_seats), updated_at = now()
      where id = v_session.id;
    end if;
  end loop;
  update public.workshops set title = p_data->>'title', description = p_data->>'description',
    experience_content = coalesce(p_data->>'experienceContent', ''),
    cover_image = nullif(p_data->>'coverImage', ''),
    reject_reason = null, status = 'PENDING', updated_at = now() where id = p_workshop;
end;
$$;
revoke all on function public.partner_resubmit_workshop(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.partner_resubmit_workshop(uuid, uuid, jsonb) to service_role;
