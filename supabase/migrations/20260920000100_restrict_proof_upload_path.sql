-- Upload bukti anon hanya boleh ke folder {order_id}/ milik order yang ada dan
-- belum batal. Sebelumnya path bebas → siapa pun bisa mengisi kuota storage
-- (docs/05 §2: 1 GB) dengan file acak. order_id hanya diketahui customer dari
-- halaman sukses/tracker, jadi tidak bisa ditebak.
create or replace function is_active_order_folder(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from orders
    where id::text = split_part(p_object_name, '/', 1)
      and status <> 'cancelled'
  );
$$;

revoke all on function is_active_order_folder(text) from public;
grant execute on function is_active_order_folder(text) to anon, authenticated;

drop policy "anon upload payment proof" on storage.objects;

create policy "anon upload payment proof" on storage.objects
  for insert to anon
  with check (bucket_id = 'payment-proofs' and public.is_active_order_folder(name));
