-- Fix: gen_random_bytes (pgcrypto) hidup di schema extensions, bukan public.
-- generate_customer_code() gagal dipanggil via anon/PostgREST karena
-- set search_path = public membatasi resolusi hanya ke public.
create or replace function generate_customer_code() returns text
language plpgsql
as $$
declare
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := extensions.gen_random_bytes(5);
  v_val bigint := 0;
  v_code text := '';
  i int;
begin
  for i in 0..4 loop
    v_val := (v_val << 8) | get_byte(v_bytes, i);
  end loop;
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, ((v_val >> (35 - i * 5)) & 31)::int + 1, 1);
  end loop;
  return v_code;
end;
$$;
