-- Temuan security review:
-- 1. "Admin" = siapa pun yang login. Signup Supabase terbuka + Google aktif,
--    jadi akun Google apa saja bisa baca data customer, verifikasi bayarannya
--    sendiri, ganti rekening. → allowlist `admins` + is_admin() di semua policy
--    dan RPC admin.
-- 2. View v_customer_balance / v_order_payment terbaca anon lewat REST (view
--    jalan dengan hak owner, melewati RLS) → bocor kode + nama semua customer.
-- 3. create_order mengembalikan kode customer lama ke siapa pun yang tahu
--    nomor WA-nya → kode hanya dikembalikan untuk customer yang baru dibuat.

create table admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;
-- Tanpa policy: tidak ada yang bisa baca/tulis lewat REST. Tambah admin lewat SQL.

create or replace function is_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

insert into admins (user_id)
select id from auth.users where email in ('yogha2002@gmail.com', 'yogmhmmd17@gmail.com');

-- Policy tabel
do $$
declare t text;
begin
  foreach t in array array['customers','events','books','event_items','orders','order_items',
                           'shipments','payments','book_requests','settings'] loop
    execute format('drop policy "admin full access" on %I', t);
    execute format('create policy "admin full access" on %I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy "admin full access payment proofs" on storage.objects;
create policy "admin full access payment proofs" on storage.objects
  for all to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin())
  with check (bucket_id = 'payment-proofs' and public.is_admin());

-- RPC admin: ganti cek auth.role() dengan is_admin(). Badan fungsi lain tidak
-- berubah, jadi ditambal dari definisi live; gagal keras kalau pola tidak ada.
do $$
declare
  f text;
  v_def text;
begin
  foreach f in array array['admin_set_event_status','import_catalog_csv',
                           'admin_review_payment','admin_update_shipment'] loop
    v_def := pg_get_functiondef(f::regproc);
    if position('auth.role() <> ''authenticated''' in v_def) = 0 then
      raise exception 'pola cek auth tidak ditemukan di %', f;
    end if;
    execute replace(v_def, 'auth.role() <> ''authenticated''', 'not public.is_admin()');
  end loop;
end $$;

-- View: ikuti RLS pemanggil, dan tutup dari anon
alter view v_order_payment set (security_invoker = true);
alter view v_customer_balance set (security_invoker = true);
revoke all on v_order_payment, v_customer_balance from anon;

-- create_order: kode hanya untuk customer yang dibuat di transaksi ini
-- (created_at = now() transaksi, sama persis dengan order-nya; tetap benar
-- saat retry idempoten). Customer lama memakai kode yang sudah dia punya.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('create_order(uuid,text,text,text,uuid,jsonb,text,text)'::regprocedure);
  if position('o.id, o.order_code, c.code,' in v_def) = 0 then
    raise exception 'pola return create_order tidak ditemukan';
  end if;
  execute replace(v_def, 'o.id, o.order_code, c.code,',
                  'o.id, o.order_code, case when c.created_at = o.created_at then c.code end,');
end $$;
