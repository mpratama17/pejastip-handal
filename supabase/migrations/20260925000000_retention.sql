-- Kebijakan retensi (docs/05 §5) — penjaga kuota storage 1 GB & tabel rate_limits.

-- =====================
-- rate_limits: bersihkan harian. Window terpanjang yang dipakai = 1 jam,
-- jadi baris > 1 hari pasti sudah tidak terpakai.
-- =====================
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-rate-limits',
  '17 3 * * *',  -- 03:17 UTC = 10:17 WIB
  $$delete from public.rate_limits where window_start < now() - interval '1 day'$$
);

-- =====================
-- Bukti transfer lama
-- =====================
-- File dihapus lewat Storage API (Supabase memblokir DELETE langsung ke
-- storage.objects); DB hanya mencatat setelah file benar-benar hilang.
alter table payments add column proof_purged_at timestamptz;

-- Kandidat: order selesai yang dibuat > 6 bulan lalu dan buktinya masih ada.
-- ponytail: pakai orders.created_at (tidak ada kolom completed_at); order selesai
-- selalu lebih tua dari tanggal selesainya, jadi aturan ini sedikit lebih agresif.
create or replace function admin_proof_purge_candidates()
returns table (payment_id uuid, proof_path text, order_code text, size_bytes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select p.id, p.proof_url, o.order_code, coalesce((so.metadata ->> 'size')::bigint, 0)
  from payments p
  join orders o on o.id = p.order_id
  left join storage.objects so on so.bucket_id = 'payment-proofs' and so.name = p.proof_url
  where o.status = 'completed'
    and o.created_at < now() - interval '6 months'
    and p.proof_url is not null
  order by o.created_at;
end;
$$;

create or replace function admin_mark_proofs_purged(p_payment_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update payments p
  set proof_url = null, proof_purged_at = now()
  where p.id = any (p_payment_ids)
    and p.proof_url is not null
    and not exists (
      select 1 from storage.objects so
      where so.bucket_id = 'payment-proofs' and so.name = p.proof_url
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function admin_proof_purge_candidates() from public, anon;
revoke all on function admin_mark_proofs_purged(uuid[]) from public, anon;
grant execute on function admin_proof_purge_candidates() to authenticated;
grant execute on function admin_mark_proofs_purged(uuid[]) to authenticated;
