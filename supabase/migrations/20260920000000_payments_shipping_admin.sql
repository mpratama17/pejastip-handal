-- M3: verifikasi pembayaran (R8/R9), form kirim (R12/R13), pengiriman &
-- customer di admin (R18). Semua aksi admin lewat RPC security definer yang
-- memeriksa auth.role() — bukan parameter klien.

-- =====================
-- Skema tambahan
-- =====================
alter table shipments
  add column recipient_name text,
  add column recipient_phone text;

alter table payments add column reviewed_at timestamptz;

-- Blacklist wajib beralasan (docs/02 §admin customers) — aturan di DB, bukan di form.
alter table customers
  add constraint customers_blacklist_reason_required
  check (not is_blacklisted or nullif(trim(blacklist_reason), '') is not null);

-- =====================
-- R8 — admin verifikasi / tolak bukti transfer
-- =====================
create or replace function admin_review_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_amount_idr integer,   -- admin boleh koreksi nominal sesuai mutasi rekening
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not p_approve and nullif(trim(p_note), '') is null then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  if p_approve and (p_amount_idr is null or p_amount_idr <= 0) then
    raise exception 'Nominal terverifikasi harus lebih dari 0.';
  end if;

  update payments
  set status = case when p_approve then 'verified' else 'rejected' end::payment_review_status,
      amount_idr = case when p_approve then p_amount_idr else amount_idr end,
      notes = nullif(trim(p_note), ''),
      verified_at = case when p_approve then now() else null end,
      reviewed_at = now()
  where id = p_payment_id
  returning order_id into v_order_id;

  if v_order_id is null then
    raise exception 'Pembayaran tidak ditemukan.';
  end if;

  -- Order pending jadi confirmed begitu ada pembayaran terverifikasi.
  if p_approve then
    update orders set status = 'confirmed' where id = v_order_id and status = 'pending';
  end if;
end;
$$;

-- =====================
-- Tracker: tampilkan riwayat pembayaran (AC-7: bukti ditolak + alasan)
-- =====================
drop function if exists get_tracker(text);

create function get_tracker(p_code text)
returns table (
  order_id uuid,
  order_code text,
  event_name text,
  total_idr integer,
  paid_idr integer,
  balance_idr integer,
  payment_state text,
  admin_notes text,
  created_at timestamptz,
  items jsonb,
  payments jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not check_rate_limit('track:' || request_ip(), 10, 60) then
    raise exception 'Terlalu banyak percobaan. Coba lagi dalam 1 menit.';
  end if;

  if not exists (select 1 from customers where code = p_code) then
    raise exception 'Kode tidak ditemukan. Periksa kembali atau hubungi admin.';
  end if;

  return query
  select
    o.id, o.order_code, e.name, o.total_idr,
    vp.paid_idr::integer, vp.balance_idr::integer, vp.payment_state,
    o.admin_notes, o.created_at,
    (
      select jsonb_agg(jsonb_build_object(
        'title', b.title, 'qty', oi.qty, 'shipping_status', oi.shipping_status,
        'tracking_number', s.tracking_number, 'courier', s.courier
      ) order by b.title)
      from order_items oi
      join event_items ei on ei.id = oi.event_item_id
      join books b on b.id = ei.book_id
      left join shipments s on s.id = oi.shipment_id
      where oi.order_id = o.id
    ),
    (
      select jsonb_agg(jsonb_build_object(
        'amount_idr', p.amount_idr, 'status', p.status, 'note', p.notes, 'created_at', p.created_at
      ) order by p.created_at desc)
      from payments p
      where p.order_id = o.id
    )
  from customers c
  join orders o on o.customer_id = c.id
  join events e on e.id = o.event_id
  join v_order_payment vp on vp.order_id = o.id
  where c.code = p_code and o.status <> 'cancelled'
  order by o.created_at desc;
end;
$$;

revoke all on function get_tracker(text) from public;
grant execute on function get_tracker(text) to anon, authenticated;

-- =====================
-- R12 — buku yang bisa dikirim (tiba + order lunas + belum masuk shipment)
-- =====================
-- Kode + nomor WA harus cocok: formulir ini menulis alamat tujuan buku yang
-- sudah dibayar, jadi kode saja (bisa bocor) tidak cukup.
create or replace function shipping_customer_id(p_code text, p_whatsapp text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from customers
  where code = upper(trim(p_code)) and whatsapp = normalize_whatsapp(p_whatsapp);
$$;

revoke all on function shipping_customer_id(text, text) from public, anon, authenticated;

create or replace function get_shippable_items(p_code text, p_whatsapp text)
returns table (
  order_item_id uuid,
  order_code text,
  title text,
  qty integer,
  eligible boolean,       -- false = sudah tiba tapi order belum lunas
  balance_idr integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if not check_rate_limit('shipping_lookup:' || request_ip(), 10, 60) then
    raise exception 'Terlalu banyak percobaan. Coba lagi dalam 1 menit.';
  end if;

  v_customer_id := shipping_customer_id(p_code, p_whatsapp);
  if v_customer_id is null then
    raise exception 'Kode dan nomor WhatsApp tidak cocok.';
  end if;

  return query
  select oi.id, o.order_code, b.title, oi.qty,
         vp.payment_state in ('fully_paid', 'overpaid'),
         vp.balance_idr::integer
  from order_items oi
  join orders o on o.id = oi.order_id
  join v_order_payment vp on vp.order_id = o.id
  join event_items ei on ei.id = oi.event_item_id
  join books b on b.id = ei.book_id
  where o.customer_id = v_customer_id
    and o.status <> 'cancelled'
    and oi.shipping_status = 'arrived_in_indo'
    and oi.shipment_id is null
  order by o.created_at, b.title;
end;
$$;

revoke all on function get_shippable_items(text, text) from public;
grant execute on function get_shippable_items(text, text) to anon, authenticated;

-- =====================
-- R13 — buat shipment (gabung & kirim parsial didukung)
-- =====================
create or replace function create_shipment(
  p_code text,
  p_whatsapp text,
  p_order_item_ids uuid[],
  p_recipient_name text,
  p_recipient_phone text,
  p_courier text,
  p_address_street text,
  p_address_detail text,
  p_city text,
  p_province text,
  p_postal_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_eligible int;
  v_shipment_id uuid;
begin
  if not check_rate_limit('create_shipment:' || request_ip(), 5, 3600) then
    raise exception 'Terlalu banyak percobaan. Coba lagi nanti.';
  end if;

  v_customer_id := shipping_customer_id(p_code, p_whatsapp);
  if v_customer_id is null then
    raise exception 'Kode dan nomor WhatsApp tidak cocok.';
  end if;

  if coalesce(array_length(p_order_item_ids, 1), 0) = 0 then
    raise exception 'Pilih minimal satu buku untuk dikirim.';
  end if;

  if nullif(trim(p_recipient_name), '') is null or nullif(trim(p_address_street), '') is null
     or nullif(trim(p_city), '') is null or nullif(trim(p_province), '') is null then
    raise exception 'Lengkapi nama penerima dan alamat.';
  end if;

  if p_postal_code !~ '^[0-9]{5}$' then
    raise exception 'Kode pos harus 5 digit.';
  end if;

  if not exists (
    select 1 from settings s, jsonb_array_elements_text(s.value) c
    where s.key = 'couriers' and c = p_courier
  ) then
    raise exception 'Kurir tidak tersedia.';
  end if;

  -- Kunci baris item supaya submit ganda tidak memasukkan item ke dua shipment (AC-13).
  select count(*) into v_eligible
  from (
    select oi.id
    from order_items oi
    join orders o on o.id = oi.order_id
    join v_order_payment vp on vp.order_id = o.id
    where oi.id = any(p_order_item_ids)
      and o.customer_id = v_customer_id
      and o.status <> 'cancelled'
      and oi.shipping_status = 'arrived_in_indo'
      and oi.shipment_id is null
      and vp.payment_state in ('fully_paid', 'overpaid')
    for update of oi
  ) eligible;

  if v_eligible <> cardinality(array(select distinct unnest(p_order_item_ids))) then
    raise exception 'Sebagian buku belum bisa dikirim (belum lunas atau sudah diajukan). Muat ulang daftar buku.';
  end if;

  insert into shipments (
    customer_id, courier, recipient_name, recipient_phone,
    address_street, address_detail, city, province, postal_code
  ) values (
    v_customer_id, p_courier, trim(p_recipient_name),
    coalesce(nullif(normalize_whatsapp(coalesce(p_recipient_phone, '')), '+62'), normalize_whatsapp(p_whatsapp)),
    trim(p_address_street), nullif(trim(p_address_detail), ''), trim(p_city), trim(p_province), p_postal_code
  )
  returning id into v_shipment_id;

  update order_items
  set shipment_id = v_shipment_id, shipping_status = 'waiting_courier'
  where id = any(p_order_item_ids);

  return v_shipment_id;
end;
$$;

revoke all on function create_shipment(text, text, uuid[], text, text, text, text, text, text, text, text) from public;
grant execute on function create_shipment(text, text, uuid[], text, text, text, text, text, text, text, text) to anon, authenticated;

-- =====================
-- Admin — pengiriman: resi + ongkir → shipped; tandai delivered
-- =====================
create or replace function admin_update_shipment(
  p_shipment_id uuid,
  p_tracking_number text,
  p_shipping_cost_idr integer,
  p_service text,
  p_mark_delivered boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_shipping_cost_idr is not null and p_shipping_cost_idr < 0 then
    raise exception 'Ongkir tidak valid.';
  end if;

  update shipments
  set tracking_number = coalesce(nullif(trim(p_tracking_number), ''), tracking_number),
      shipping_cost_idr = coalesce(p_shipping_cost_idr, shipping_cost_idr),
      service = coalesce(nullif(trim(p_service), ''), service),
      shipped_at = case when nullif(trim(p_tracking_number), '') is not null then coalesce(shipped_at, now()) else shipped_at end,
      delivered_at = case when p_mark_delivered then coalesce(delivered_at, now()) else delivered_at end
  where id = p_shipment_id;

  if not found then
    raise exception 'Pengiriman tidak ditemukan.';
  end if;

  if p_mark_delivered then
    if not exists (select 1 from shipments where id = p_shipment_id and tracking_number is not null) then
      raise exception 'Isi resi dulu sebelum menandai diterima.';
    end if;
    update order_items set shipping_status = 'delivered' where shipment_id = p_shipment_id;
  elsif nullif(trim(p_tracking_number), '') is not null then
    update order_items set shipping_status = 'shipped'
    where shipment_id = p_shipment_id and shipping_status = 'waiting_courier';
  end if;

  -- Order selesai bila semua item terkirim dan lunas.
  update orders o
  set status = 'completed'
  from v_order_payment vp
  where vp.order_id = o.id
    and o.status = 'confirmed'
    and vp.payment_state in ('fully_paid', 'overpaid')
    and o.id in (select order_id from order_items where shipment_id = p_shipment_id)
    and not exists (
      select 1 from order_items oi where oi.order_id = o.id and oi.shipping_status <> 'delivered'
    );
end;
$$;

revoke all on function admin_review_payment(uuid, boolean, integer, text) from public, anon;
grant execute on function admin_review_payment(uuid, boolean, integer, text) to authenticated;
revoke all on function admin_update_shipment(uuid, text, integer, text, boolean) from public, anon;
grant execute on function admin_update_shipment(uuid, text, integer, text, boolean) to authenticated;
