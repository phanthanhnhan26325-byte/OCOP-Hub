insert into public.product_categories (name, slug, status)
values
  ('Đặc sản', 'dac-san', 'ACTIVE'),
  ('Quà tặng', 'qua-tang', 'ACTIVE'),
  ('Đồ lưu niệm', 'do-luu-niem', 'ACTIVE'),
  ('Khác', 'khac', 'ACTIVE')
on conflict (slug) do update
  set name = excluded.name,
      status = excluded.status;

update public.products p
   set category_id = correct.id
  from public.product_categories old
  join public.product_categories correct on correct.slug = 'dac-san'
 where p.category_id = old.id
   and old.name = 'Đặc biệt'
   and old.slug <> 'dac-san';

update public.product_categories
   set status = 'INACTIVE'
 where name = 'Đặc biệt'
   and slug <> 'dac-san';
