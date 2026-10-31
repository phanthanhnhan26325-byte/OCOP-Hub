insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ocop-product-images-v1',
  'ocop-product-images-v1',
  true,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_upload_partner on storage.objects;
create policy product_images_upload_partner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ocop-product-images-v1'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_partner_approved()
  );

drop policy if exists product_images_delete_partner on storage.objects;
create policy product_images_delete_partner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ocop-product-images-v1'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_partner_approved()
  );
