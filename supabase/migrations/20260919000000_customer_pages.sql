-- Halaman customer: katalog, terlaris, book request, konten publik di settings.
-- Plus perbaikan rate limit: IP diambil server-side dari header Cloudflare,
-- bukan dari parameter klien (frontend statis tidak pernah mengirimnya, jadi
-- sebelumnya semua pengunjung berbagi satu kuota "…:unknown").

-- =====================
-- IP klien (docs/05 §3): percayai cf-connecting-ip dari edge Supabase
-- =====================
create or replace function request_ip() returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'cf-connecting-ip', ''),
    'unknown'
  );
$$;

-- Helper internal tidak boleh dipanggil langsung lewat REST: check_rate_limit
-- yang terbuka membuat siapa pun bisa menghabiskan kuota nomor WA/IP orang
-- lain. Fungsi security definer di bawah tetap bisa memanggilnya.
revoke all on function check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function normalize_whatsapp(text) from public, anon, authenticated;
revoke all on function generate_customer_code() from public, anon, authenticated;
revoke all on function request_ip() from public, anon, authenticated;
-- Supabase memberi EXECUTE ke anon lewat default privileges (bukan cuma lewat
-- PUBLIC), jadi "revoke from public" di migrasi admin belum cukup.
revoke all on function admin_set_event_status(uuid, event_status) from anon;
revoke all on function import_catalog_csv(uuid, jsonb) from anon;

-- =====================
-- Redefinisi RPC M2 tanpa p_client_ip
-- =====================
drop function if exists create_order(uuid, text, text, text, uuid, jsonb, text, text, text);
drop function if exists get_tracker(text, text);
drop function if exists submit_payment_proof(text, text, integer, payment_method, date, text, text);

create function create_order(
  p_idempotency_key uuid,
  p_full_name text,
  p_whatsapp text,
  p_instagram text,
  p_event_id uuid,
  p_items jsonb,
  p_payment_type text,
  p_customer_notes text
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
  select o.id into v_order_id from orders o where o.idempotency_key = p_idempotency_key;

  if v_order_id is null then
    if not check_rate_limit('create_order:' || request_ip(), 5, 60) then
      raise exception 'Terlalu banyak percobaan order. Coba lagi dalam 1 menit.';
    end if;

    v_wa := normalize_whatsapp(p_whatsapp);

    if not check_rate_limit('create_order_wa:' || v_wa, 3, 3600) then
      raise exception 'Terlalu banyak order dari nomor ini. Coba lagi nanti atau hubungi admin.';
    end if;

    if exists (select 1 from customers where whatsapp = v_wa and is_blacklisted) then
      raise exception 'Order tidak dapat diproses. Hubungi admin.';
    end if;

    select * into v_event from events where id = p_event_id;
    if not found or v_event.status <> 'open' then
      raise exception 'Batch ini sudah tidak menerima order. Muat ulang halaman.';
    end if;

    if p_items is null or jsonb_array_length(p_items) = 0 then
      raise exception 'Belum ada buku dipilih.';
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

    insert into order_items (order_id, event_item_id, qty, unit_price_idr)
    select v_order_id, ei.id, (i->>'qty')::int, ei.price_idr
    from jsonb_array_elements(p_items) i
    join event_items ei on ei.id = (i->>'event_item_id')::uuid;
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
  items jsonb
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
    )
  from customers c
  join orders o on o.customer_id = c.id
  join events e on e.id = o.event_id
  join v_order_payment vp on vp.order_id = o.id
  where c.code = p_code and o.status <> 'cancelled'
  order by o.created_at desc;
end;
$$;

create function submit_payment_proof(
  p_customer_code text,
  p_order_code text,
  p_amount_idr integer,
  p_method payment_method,
  p_paid_at date,
  p_proof_path text
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
  where c.code = p_customer_code and o.order_code = p_order_code and o.status <> 'cancelled';

  if v_order_id is null then
    raise exception 'Order tidak ditemukan.';
  end if;

  -- Path harus di folder order ini — cegah klaim file order lain.
  if p_proof_path is null or p_proof_path not like v_order_id::text || '/%' then
    raise exception 'Bukti transfer tidak valid.';
  end if;

  select count(*) into v_existing_count from payments p where p.order_id = v_order_id;
  if v_existing_count >= 10 then
    raise exception 'Batas jumlah upload bukti untuk order ini sudah tercapai. Hubungi admin.';
  end if;

  if p_amount_idr is null or p_amount_idr <= 0 then
    raise exception 'Nominal tidak valid.';
  end if;

  return query
  insert into payments (order_id, amount_idr, method, proof_url, paid_at)
  values (v_order_id, p_amount_idr, p_method, p_proof_path, p_paid_at)
  returning payments.id, payments.status::text;
end;
$$;

revoke all on function create_order(uuid, text, text, text, uuid, jsonb, text, text) from public;
grant execute on function create_order(uuid, text, text, text, uuid, jsonb, text, text) to anon, authenticated;
revoke all on function get_tracker(text) from public;
grant execute on function get_tracker(text) to anon, authenticated;
revoke all on function submit_payment_proof(text, text, integer, payment_method, date, text) from public;
grant execute on function submit_payment_proof(text, text, integer, payment_method, date, text) to anon, authenticated;

-- =====================
-- Katalog publik dengan sisa stok (anon tidak bisa baca order_items)
-- =====================
create or replace function get_catalogue(p_event_id uuid)
returns table (
  event_item_id uuid,
  isbn text,
  title text,
  author text,
  format book_format,
  cover_url text,
  price_idr integer,
  stock_left integer  -- null = PO tanpa batas
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ei.id, b.isbn, b.title, b.author, b.format, b.cover_url, ei.price_idr,
    case when ei.stock is null then null
         else greatest(ei.stock - coalesce((
           select sum(oi.qty) from order_items oi
           join orders o on o.id = oi.order_id
           where oi.event_item_id = ei.id and o.status <> 'cancelled'
         ), 0), 0)::integer
    end
  from event_items ei
  join books b on b.id = ei.book_id
  join events e on e.id = ei.event_id
  where ei.event_id = p_event_id
    and ei.is_active
    and e.status not in ('draft', 'cancelled')
  order by b.title;
$$;

revoke all on function get_catalogue(uuid) from public;
grant execute on function get_catalogue(uuid) to anon, authenticated;

-- Terlaris: qty terbanyak di order non-batal; kalau belum ada penjualan,
-- jatuh ke buku terbaru supaya beranda tidak kosong.
create or replace function get_bestsellers(p_limit integer default 10)
returns table (book_id uuid, title text, author text, cover_url text, sold integer)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.title, b.author, b.cover_url,
         coalesce(sum(oi.qty) filter (where o.status <> 'cancelled'), 0)::integer as sold
  from books b
  left join event_items ei on ei.book_id = b.id
  left join order_items oi on oi.event_item_id = ei.id
  left join orders o on o.id = oi.order_id
  group by b.id
  order by sold desc, b.created_at desc
  limit least(greatest(p_limit, 1), 30);
$$;

revoke all on function get_bestsellers(integer) from public;
grant execute on function get_bestsellers(integer) to anon, authenticated;

-- =====================
-- Book request (R19)
-- =====================
alter table book_requests add column format book_format;

create or replace function create_book_request(
  p_customer_name text,
  p_whatsapp text,
  p_isbn text,
  p_title text,
  p_format book_format,
  p_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wa text := normalize_whatsapp(p_whatsapp);
  v_id uuid;
begin
  if not check_rate_limit('book_request:' || request_ip(), 3, 3600) then
    raise exception 'Terlalu banyak request. Coba lagi dalam 1 jam.';
  end if;

  if nullif(trim(p_customer_name), '') is null or nullif(trim(p_title), '') is null then
    raise exception 'Nama dan judul buku wajib diisi.';
  end if;

  if length(v_wa) < 11 then
    raise exception 'Nomor WA belum benar.';
  end if;

  insert into book_requests (customer_id, customer_name, whatsapp, isbn, title, format, notes)
  values (
    (select id from customers where whatsapp = v_wa),
    trim(p_customer_name), v_wa, nullif(regexp_replace(coalesce(p_isbn, ''), '[^0-9Xx]', '', 'g'), ''),
    trim(p_title), p_format, nullif(trim(p_notes), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function create_book_request(text, text, text, text, book_format, text) from public;
grant execute on function create_book_request(text, text, text, text, book_format, text) to anon, authenticated;

-- =====================
-- Konten publik di settings (white-label: tidak hardcode di komponen)
-- =====================
insert into settings (key, value) values
  ('store_tagline', '"Buku impor favoritmu, dititipkan dengan hati-hati sampai ke rak."'),
  ('store_about', '"Toko buku daring independen yang menitipkan buku langsung dari penerbit dan toko buku luar negeri. Order per batch, dipantau lewat kode pribadi."'),
  ('instagram_handle', '""'),
  ('wa_group_link', '""'),
  ('terms', $json$[
    {"title": "Tentang pemesanan", "body": "Pemesanan dibuka per batch. Setiap batch punya katalog, persentase DP, dan perkiraan waktu tiba sendiri — lihat halaman Batch Berjalan."},
    {"title": "DP dan pelunasan", "body": "Order diproses setelah DP terverifikasi. Pelunasan dilakukan saat buku sudah tiba di Indonesia; kami kabari lewat WhatsApp. Buku baru bisa dikirim setelah lunas."},
    {"title": "Ketersediaan buku", "body": "Buku pre-order bergantung pada stok penerbit. Jika buku tidak tersedia, dana untuk buku tersebut dikembalikan atau dialihkan sesuai kesepakatan."},
    {"title": "Pembatalan", "body": "Order yang sudah dibelanjakan ke penerbit tidak dapat dibatalkan. Pembatalan sepihak dapat membuat nomor kamu tidak bisa order lagi."},
    {"title": "Kondisi buku", "body": "Buku impor bisa mengalami cacat ringan dari pabrik atau perjalanan (sudut tertekuk, goresan kecil). Keluhan kerusakan berat disertai video unboxing."},
    {"title": "Pengiriman", "body": "Isi Form Kirim setelah lunas. Ongkir dihitung setelah paket ditimbang; resi muncul di halaman Lacak Order."}
  ]$json$::jsonb)
on conflict (key) do nothing;
