-- RPC publik untuk M2: order form, halaman sukses, tracker.
-- Semua tulis publik lewat RPC security definer (docs/01 §Model akses);
-- tabel dasar tetap deny-by-default untuk anon.

-- =====================
-- Skema tambahan yang dibutuhkan R5 (idempotency) — belum ada di 01
-- =====================
alter table orders add column idempotency_key uuid;
create unique index orders_idempotency_key_idx on orders (idempotency_key) where idempotency_key is not null;

create sequence order_code_seq;

-- Bank rekening/nomor WA admin dipakai untuk instruksi bayar di halaman
-- publik (bukan data sensitif) — settings butuh dibaca anon.
create policy "public read settings" on settings
  for select to anon using (true);

-- =====================
-- Helper: normalisasi WA (R2/AC-3) & kode customer (Keamanan §: Crockford base32)
-- =====================
create or replace function normalize_whatsapp(p_input text) returns text
language plpgsql
immutable
as $$
declare
  v_digits text := regexp_replace(p_input, '\D', '', 'g');
begin
  if v_digits like '0%' then
    v_digits := '62' || substr(v_digits, 2);
  elsif v_digits not like '62%' then
    v_digits := '62' || v_digits;
  end if;
  return '+' || v_digits;
end;
$$;

create or replace function generate_customer_code() returns text
language plpgsql
as $$
declare
  v_alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; -- Crockford base32
  v_bytes bytea := extensions.gen_random_bytes(5); -- 40 bit; pgcrypto hidup di schema extensions, bukan public
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

-- =====================
-- R1-R6 — buat order (5 langkah order form, satu transaksi)
-- =====================
create or replace function create_order(
  p_idempotency_key uuid,
  p_full_name text,
  p_whatsapp text,
  p_instagram text,
  p_event_id uuid,
  p_items jsonb,          -- [{"event_item_id": "...", "qty": 2}, ...] — harga TIDAK dari sini (AC-6)
  p_payment_type text,    -- 'dp' | 'full' — cuma pengaruhi nominal_due yang ditampilkan
  p_customer_notes text,
  p_client_ip text default null
) returns table (
  order_id uuid,
  order_code text,
  customer_code text,
  subtotal_idr integer,
  total_idr integer,
  nominal_due_idr integer,
  dp_percent numeric,
  store_name text,
  bank_accounts jsonb,
  wa_admin_number text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wa text;
  v_customer_id uuid;
  v_order_id uuid;
  v_event record;
  v_item jsonb;
  v_event_item record;
  v_qty int;
  v_subtotal int := 0;
  v_order_code text;
  v_code text;
  v_attempt int;
begin
  if not check_rate_limit('create_order:' || coalesce(p_client_ip, 'unknown'), 5, 60) then
    raise exception 'Terlalu banyak percobaan order. Coba lagi dalam 1 menit.';
  end if;

  select o.id into v_order_id from orders o where o.idempotency_key = p_idempotency_key;

  if v_order_id is null then
    v_wa := normalize_whatsapp(p_whatsapp);

    if exists (select 1 from customers where whatsapp = v_wa and is_blacklisted) then
      raise exception 'Order tidak dapat diproses. Hubungi admin.';
    end if;

    select * into v_event from events where id = p_event_id;
    if not found or v_event.status <> 'open' then
      raise exception 'Batch ini sudah tidak menerima order. Muat ulang halaman.';
    end if;

    select id into v_customer_id from customers where whatsapp = v_wa;
    if v_customer_id is null then
      for v_attempt in 1..5 loop
        v_code := generate_customer_code();
        begin
          insert into customers (code, full_name, whatsapp, instagram)
          values (v_code, p_full_name, v_wa, nullif(p_instagram, ''))
          returning id into v_customer_id;
          exit;
        exception when unique_violation then
          if v_attempt = 5 then raise; end if;
        end;
      end loop;
    end if;

    if jsonb_array_length(p_items) = 0 then
      raise exception 'Belum ada buku dipilih.';
    end if;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_qty := nullif(v_item->>'qty', '')::int;
      if v_qty is null or v_qty < 1 then
        raise exception 'Qty tidak valid.';
      end if;

      select * into v_event_item
      from event_items
      where id = (v_item->>'event_item_id')::uuid
        and event_id = p_event_id
        and is_active
      for update;

      if not found then
        raise exception 'Salah satu buku sudah tidak tersedia di batch ini.';
      end if;

      if v_event_item.stock is not null then
        if v_event_item.stock < v_qty + coalesce((
          select sum(oi.qty) from order_items oi
          join orders o on o.id = oi.order_id
          where oi.event_item_id = v_event_item.id and o.status <> 'cancelled'
        ), 0) then
          raise exception 'Stok tidak cukup untuk salah satu buku.';
        end if;
      end if;

      v_subtotal := v_subtotal + v_event_item.price_idr * v_qty;
    end loop;

    v_order_code := 'ORD-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('order_code_seq')::text, 4, '0');

    insert into orders (order_code, customer_id, event_id, subtotal_idr, customer_notes, idempotency_key)
    values (v_order_code, v_customer_id, p_event_id, v_subtotal, nullif(p_customer_notes, ''), p_idempotency_key)
    returning id into v_order_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into order_items (order_id, event_item_id, qty, unit_price_idr)
      select v_order_id, ei.id, (v_item->>'qty')::int, ei.price_idr
      from event_items ei
      where ei.id = (v_item->>'event_item_id')::uuid;
    end loop;
  end if;

  return query
  select
    o.id, o.order_code, c.code, o.subtotal_idr, o.total_idr,
    case when p_payment_type = 'full' then o.total_idr
         else ceil(o.total_idr * e.dp_percent / 100.0)::int end,
    e.dp_percent,
    (select value #>> '{}' from settings where key = 'store_name'),
    (select value from settings where key = 'bank_accounts'),
    (select value #>> '{}' from settings where key = 'wa_admin_number')
  from orders o
  join customers c on c.id = o.customer_id
  join events e on e.id = o.event_id
  where o.id = v_order_id;
end;
$$;

revoke all on function create_order(uuid, text, text, text, uuid, jsonb, text, text, text) from public;
grant execute on function create_order(uuid, text, text, text, uuid, jsonb, text, text, text) to anon, authenticated;

-- =====================
-- R7 — klaim bukti transfer (file sudah diupload ke Storage sebelum RPC ini)
-- =====================
create or replace function submit_payment_proof(
  p_customer_code text,
  p_order_code text,
  p_amount_idr integer,
  p_method payment_method,
  p_paid_at date,
  p_proof_path text,
  p_client_ip text default null
) returns table (payment_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_existing_count int;
begin
  if not check_rate_limit('submit_payment:' || p_customer_code, 5, 3600) then
    raise exception 'Terlalu banyak upload. Coba lagi nanti.';
  end if;

  select o.id into v_order_id
  from orders o
  join customers c on c.id = o.customer_id
  where c.code = p_customer_code and o.order_code = p_order_code;

  if v_order_id is null then
    raise exception 'Order tidak ditemukan.';
  end if;

  select count(*) into v_existing_count from payments where order_id = v_order_id;
  if v_existing_count >= 10 then
    raise exception 'Batas jumlah upload bukti untuk order ini sudah tercapai. Hubungi admin.';
  end if;

  if p_amount_idr is null or p_amount_idr <= 0 then
    raise exception 'Nominal tidak valid.';
  end if;

  return query
  insert into payments (order_id, amount_idr, method, proof_url, paid_at)
  values (v_order_id, p_amount_idr, p_method, p_proof_path, p_paid_at)
  returning id, status;
end;
$$;

revoke all on function submit_payment_proof(text, text, integer, payment_method, date, text, text) from public;
grant execute on function submit_payment_proof(text, text, integer, payment_method, date, text, text) to anon, authenticated;

-- =====================
-- R10/R11 — tracker
-- =====================
create or replace function get_tracker(
  p_code text,
  p_client_ip text default null
) returns table (
  order_id uuid,
  order_code text,
  event_name text,
  total_idr integer,
  paid_idr integer,
  balance_idr integer,
  payment_state text,
  admin_notes text,
  created_at timestamptz,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not check_rate_limit('track:' || coalesce(p_client_ip, 'unknown'), 10, 60) then
    raise exception 'Terlalu banyak percobaan. Coba lagi dalam 1 menit.';
  end if;

  if not exists (select 1 from customers where code = p_code) then
    raise exception 'Kode tidak ditemukan. Periksa kembali atau hubungi admin.';
  end if;

  return query
  select
    o.id, o.order_code, e.name, o.total_idr, vp.paid_idr, vp.balance_idr, vp.payment_state,
    o.admin_notes, o.created_at,
    (
      select jsonb_agg(jsonb_build_object(
        'title', b.title, 'qty', oi.qty, 'shipping_status', oi.shipping_status
      ) order by b.title)
      from order_items oi
      join event_items ei on ei.id = oi.event_item_id
      join books b on b.id = ei.book_id
      where oi.order_id = o.id
    )
  from customers c
  join orders o on o.customer_id = c.id
  join events e on e.id = o.event_id
  join v_order_payment vp on vp.order_id = o.id
  where c.code = p_code and o.status <> 'cancelled'
  order by o.created_at desc;
end;
$$;

revoke all on function get_tracker(text, text) from public;
grant execute on function get_tracker(text, text) to anon, authenticated;

-- =====================
-- Storage — bukti transfer, bucket privat
-- =====================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "anon upload payment proof" on storage.objects
  for insert to anon
  with check (bucket_id = 'payment-proofs');

create policy "admin full access payment proofs" on storage.objects
  for all to authenticated
  using (bucket_id = 'payment-proofs')
  with check (bucket_id = 'payment-proofs');
