-- Sampul buku (docs/04 §6). Bucket PUBLIK: sampul tampil di katalog untuk
-- pengunjung tanpa login, dan URL-nya bisa di-cache CDN. Tulis hanya admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('book-covers', 'book-covers', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "admin manage book covers" on storage.objects
  for all to authenticated
  using (bucket_id = 'book-covers' and public.is_admin())
  with check (bucket_id = 'book-covers' and public.is_admin());
