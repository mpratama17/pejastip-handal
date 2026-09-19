-- Pengembalian kelebihan bayar.
--
-- Uangnya dikembalikan admin di luar aplikasi (transfer manual). Yang dicatat
-- di sini cuma faktanya, supaya statusnya berhenti bilang "Lebih Bayar" setelah
-- diselesaikan, dan supaya ada catatan kapan serta lewat apa dikembalikan.
--
-- Kenapa kolom di `orders`, bukan tabel `refunds`: tabel baru berarti satu lagi
-- yang wajib di-`enable row level security` + policy. Skema ini deny-by-default
-- karena tiap tabel diberi RLS satu per satu, bukan karena otomatis — tabel baru
-- yang lupa diberi RLS langsung terbuka lewat PostgREST. Satu order praktis
-- cuma punya satu pengembalian, jadi tiga kolom sudah cukup dan membatalkannya
-- tinggal menyetel null.
--
-- Kenapa bukan payments beramount negatif: `payments.amount_idr` punya
-- `check (amount_idr > 0)`, dan melonggarkannya akan mengubah arti setiap baris
-- payments yang sudah ada di seluruh UI.

alter table orders
  add column if not exists refund_amount_idr integer check (refund_amount_idr > 0),
  add column if not exists refunded_at        date,
  add column if not exists refund_note        text check (refund_note is null or length(refund_note) <= 500);

comment on column orders.refund_amount_idr is
  'Kelebihan bayar yang sudah dikembalikan ke customer. Null = belum ada pengembalian.';

-- =====================
-- v_order_payment: status dihitung dari pembayaran BERSIH
-- =====================
-- payment_state harus memakai nilai bersih (diterima dikurangi dikembalikan),
-- kalau tidak statusnya akan selamanya "Lebih Bayar" walau uangnya sudah balik —
-- dan itu justru inti permintaannya.
--
-- Kolom lama dipertahankan nama, urutan, dan tipenya; dua kolom baru ditambahkan
-- DI BELAKANG. `create or replace view` hanya mengizinkan penambahan di akhir,
-- dan v_customer_balance yang bergantung pada view ini ikut benar sendiri karena
-- dia membaca balance_idr + payment_state.
--
-- Catatan tipe: sum() menghasilkan bigint, jadi paid_idr dan balance_idr tetap
-- bigint seperti sebelumnya. Jangan di-cast ke integer — tipe yang berubah
-- membuat create or replace ditolak.
create or replace view v_order_payment as
select
  o.id        as order_id,
  o.total_idr,
  g.gross - coalesce(o.refund_amount_idr, 0)                                  as paid_idr,
  greatest(o.total_idr - (g.gross - coalesce(o.refund_amount_idr, 0)), 0)     as balance_idr,
  case
    when g.gross - coalesce(o.refund_amount_idr, 0) =  0           then 'not_paid'
    when g.gross - coalesce(o.refund_amount_idr, 0) <  o.total_idr then 'partially_paid'
    when g.gross - coalesce(o.refund_amount_idr, 0) =  o.total_idr then 'fully_paid'
    else 'overpaid'
  end                                                                         as payment_state,
  coalesce(o.refund_amount_idr, 0)                                            as refunded_idr,
  g.gross                                                                     as gross_paid_idr
from orders o
cross join lateral (
  select coalesce(sum(p.amount_idr) filter (where p.status = 'verified'), 0) as gross
  from payments p
  where p.order_id = o.id
) g;

-- =====================
-- RPC
-- =====================
create or replace function admin_record_refund(
  p_order_id    uuid,
  p_amount_idr  integer,
  p_refunded_at date,
  p_note        text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gross  bigint;
  v_total  integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_amount_idr is null or p_amount_idr <= 0 then
    raise exception 'Nominal pengembalian harus lebih dari 0.';
  end if;

  select o.total_idr into v_total from orders o where o.id = p_order_id;
  if v_total is null then
    raise exception 'Order tidak ditemukan.';
  end if;

  select coalesce(sum(p.amount_idr) filter (where p.status = 'verified'), 0)
    into v_gross
  from payments p
  where p.order_id = p_order_id;

  -- Salah ketik tidak boleh membuat pembayaran bersih jadi minus: statusnya
  -- akan jatuh ke 'not_paid' dan tagihan customer ikut ngawur.
  if p_amount_idr > v_gross then
    raise exception 'Pengembalian Rp% melebihi total yang sudah diterima (Rp%).',
      p_amount_idr, v_gross;
  end if;

  update orders
  set refund_amount_idr = p_amount_idr,
      refunded_at       = coalesce(p_refunded_at, current_date),
      refund_note       = nullif(trim(p_note), '')
  where id = p_order_id;
end;
$$;

-- Batalkan pencatatan (salah ketik, atau ternyata belum jadi dikembalikan).
create or replace function admin_clear_refund(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update orders
  set refund_amount_idr = null,
      refunded_at       = null,
      refund_note       = null
  where id = p_order_id;
end;
$$;

revoke all on function admin_record_refund(uuid, integer, date, text) from public, anon;
grant execute on function admin_record_refund(uuid, integer, date, text) to authenticated;
revoke all on function admin_clear_refund(uuid) from public, anon;
grant execute on function admin_clear_refund(uuid) to authenticated;
