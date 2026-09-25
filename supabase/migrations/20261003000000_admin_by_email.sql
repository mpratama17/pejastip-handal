-- Allowlist admin per EMAIL, bukan user_id.
--
-- Masalah lama: user_id baru ada setelah orangnya login sekali, jadi admin
-- tidak bisa didaftarkan duluan. `insert ... select id from auth.users where
-- email = ...` untuk akun yang belum pernah login diam-diam tidak memasukkan
-- apa-apa (terjadi pada yogmhmmd17@gmail.com di migration 20260921).
--
-- Kenapa harus identitas GOOGLE yang terverifikasi: begitu email bisa
-- didaftarkan sebelum orangnya login, siapa pun yang lebih dulu membuat akun
-- email+password dengan alamat itu akan ikut lolos kalau yang dicek hanya
-- auth.users.email. Email Google diverifikasi Google, tidak bisa diklaim orang
-- lain. Semua admin memang login lewat Google (dicek 24 Sep).
--
-- Tambah admin:  insert into admins (email) values ('client@gmail.com');
-- Cabut admin:   delete from admins where email = 'client@gmail.com';

alter table admins add column email text;
update admins a set email = lower(u.email) from auth.users u where u.id = a.user_id;
alter table admins alter column email set not null;
alter table admins drop constraint admins_pkey;
alter table admins drop column user_id;
alter table admins add primary key (email);
alter table admins add constraint admins_email_lower check (email = lower(trim(email)));

create or replace function is_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.identities i
    join admins a on a.email = lower(i.identity_data->>'email')
    where i.user_id = auth.uid()
      and i.provider = 'google'
      and (i.identity_data->>'email_verified')::boolean
  );
$$;
