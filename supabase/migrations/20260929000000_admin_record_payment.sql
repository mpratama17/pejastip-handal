-- Catat pembayaran manual dari sisi admin.
--
-- Kenapa bukan tombol "ubah status bayar": status bayar TIDAK disimpan. Dia
-- dihitung `v_order_payment` dari jumlah payments ber-status 'verified'. Tombol
-- yang menyetel status langsung akan membuat chip bilang "Lunas" sementara
-- Terbayar tetap Rp0 — aturan yang cuma hidup di UI. Jadi yang dicatat adalah
-- pembayarannya; statusnya ikut sendiri.
--
-- Dipakai untuk transfer yang admin lihat sendiri di mutasi rekening, tanpa
-- customer mengunggah bukti. proof_url sengaja null; alasannya ditulis di notes
-- supaya baris tanpa bukti tidak terbaca seperti data hilang.

create or replace function admin_record_payment(
  p_order_id   uuid,
  p_amount_idr integer,
  p_method     payment_method,
  p_paid_at    date,
  p_note       text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_exists     boolean;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_amount_idr is null or p_amount_idr <= 0 then
    raise exception 'Nominal harus lebih dari 0.';
  end if;

  select exists (select 1 from orders where id = p_order_id) into v_exists;
  if not v_exists then
    raise exception 'Order tidak ditemukan.';
  end if;

  -- Langsung 'verified': admin sudah melihat dananya masuk, tidak ada bukti
  -- untuk direview. Nominal di atas sisa tagihan dibiarkan — v_order_payment
  -- sudah punya state 'overpaid', dan transfer lebih memang bisa terjadi.
  insert into payments (order_id, amount_idr, method, proof_url, status, paid_at, verified_at, reviewed_at, notes)
  values (
    p_order_id,
    p_amount_idr,
    p_method,
    null,
    'verified',
    coalesce(p_paid_at, current_date),
    now(),
    now(),
    'Dicatat manual oleh admin (tanpa bukti unggah).' ||
      coalesce(' ' || nullif(trim(p_note), ''), '')
  )
  returning id into v_payment_id;

  -- Sama seperti admin_review_payment: order pending jadi confirmed begitu ada
  -- pembayaran terverifikasi.
  update orders set status = 'confirmed' where id = p_order_id and status = 'pending';

  return v_payment_id;
end;
$$;

-- Salah ketik nominal tidak boleh berarti "panggil orang untuk jalankan SQL".
-- Hanya baris manual (proof_url is null) yang boleh dihapus — bukti unggahan
-- customer tetap harus lewat alur tolak/verifikasi, bukan dihapus diam-diam.
create or replace function admin_delete_manual_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from payments
  where id = p_payment_id and proof_url is null
  returning order_id into v_order_id;

  if v_order_id is null then
    raise exception 'Hanya pembayaran yang dicatat manual yang bisa dihapus.';
  end if;

  -- Kalau pembayaran terverifikasi habis, order kembali pending.
  update orders o set status = 'pending'
  where o.id = v_order_id
    and o.status = 'confirmed'
    and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'verified');
end;
$$;

revoke all on function admin_record_payment(uuid, integer, payment_method, date, text) from public, anon;
grant execute on function admin_record_payment(uuid, integer, payment_method, date, text) to authenticated;
revoke all on function admin_delete_manual_payment(uuid) from public, anon;
grant execute on function admin_delete_manual_payment(uuid) to authenticated;
