-- Skema inti — transkripsi langsung dari docs/01-database-schema.md.
-- Kalau skema di sini dan di docs/01 pernah beda, docs/01 menang untuk STRUKTUR
-- (PRD menang untuk PERILAKU) — lihat catatan di docs/03-prd.md §intro.

-- =====================
-- ENUMS
-- =====================
create type event_type as enum (
  'publisher_po_us',   -- PO penerbit US (udara/laut)
  'publisher_po_uk',   -- PO / direct UK
  'ready_stock',
  'secondhand',        -- ala Vinted di Blossom
  'special_edition',
  'bbw_jastip',        -- Big Bad Wolf / bazar
  'other'
);

create type event_status as enum (
  'draft',            -- disiapkan admin, belum tampil
  'open',             -- menerima order
  'closed',           -- PO ditutup, menunggu dibelanjakan
  'ordered',          -- sudah dibelanjakan ke penerbit/supplier
  'shipped_to_indo',
  'arrived',          -- tiba di tangan admin
  'completed',
  'cancelled'
);

create type book_format as enum ('paperback', 'hardcover', 'boxset', 'other');

create type order_status as enum (
  'pending',    -- masuk dari form, belum dikonfirmasi admin
  'confirmed',  -- admin sudah verifikasi (minimal DP terverifikasi)
  'completed',  -- semua item terkirim & lunas
  'cancelled'
);

create type payment_method as enum ('bank_transfer', 'shopeepay', 'qris', 'other');
-- 'qris' dicadangkan untuk fase gateway; enum tidak perlu diubah nanti.

create type payment_review_status as enum ('pending', 'verified', 'rejected');

create type item_shipping_status as enum (
  'not_shipped',      -- belum dibelanjakan / belum jalan
  'shipped_to_indo',
  'arrived_in_indo',  -- sudah di tangan admin
  'waiting_courier',  -- shipping form sudah diisi, menunggu diserahkan kurir
  'shipped',          -- resi terbit
  'delivered'
);

create type request_status as enum ('new', 'sourcing', 'quoted', 'fulfilled', 'rejected');

-- =====================
-- TABEL
-- =====================
create table customers (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,      -- token tracker, acak (mis. base32 8 char), BUKAN sekuensial
  full_name        text not null,
  whatsapp         text not null unique,      -- format E.164 (+62...), dinormalisasi di server
  instagram        text,
  is_blacklisted   boolean not null default false,
  blacklist_reason text,
  notes            text,                       -- catatan internal admin
  created_at       timestamptz not null default now()
);

create table events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,              -- "US Publisher PO Batch 12"
  type             event_type not null,
  status           event_status not null default 'draft',
  dp_percent       numeric(5,2) not null default 35,  -- 35 PO, 50 special edition, 100 ready stock/BBW
  payment_due_hours integer,                   -- null = pelunasan saat notifikasi tiba; 48 = ready stock; 12 = BBW
  eta_note         text,                       -- "1-2 bulan (udara)" — teks bebas, tampil di Ongoing Orders
  description      text,
  opens_at         timestamptz,
  closes_at        timestamptz,
  created_at       timestamptz not null default now()
);

create table books (
  id         uuid primary key default gen_random_uuid(),
  isbn       text,                             -- nullable: buku secondhand kadang tanpa ISBN
  title      text not null,
  author     text,
  format     book_format not null default 'paperback',
  cover_url  text,
  notes      text,
  created_at timestamptz not null default now()
);
-- ISBN unik hanya jika terisi:
create unique index books_isbn_unique on books (isbn) where isbn is not null;

-- Buku yang ditawarkan di sebuah event, dengan harga & stok khusus event itu.
-- Satu ISBN bisa muncul di banyak event dengan harga berbeda (kurs & ongkir impor berubah).
create table event_items (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  book_id    uuid not null references books(id),
  price_idr  integer not null check (price_idr >= 0),
  stock      integer,                          -- null = tanpa batas (PO), angka = ready stock
  is_active  boolean not null default true,
  unique (event_id, book_id)
);

create table orders (
  id             uuid primary key default gen_random_uuid(),
  order_code     text not null unique,         -- human-readable: ORD-2601-0042
  customer_id    uuid not null references customers(id),
  event_id       uuid not null references events(id),
  status         order_status not null default 'pending',
  subtotal_idr   integer not null check (subtotal_idr >= 0),
  discount_idr   integer not null default 0 check (discount_idr >= 0),
  discount_note  text,                         -- "loyalty claim", "member lama", dll.
  total_idr      integer generated always as (subtotal_idr - discount_idr) stored,
  customer_notes text,                         -- dari form
  admin_notes    text,                         -- tampil di tracker ("Notes from admin" ala Blossom)
  created_at     timestamptz not null default now()
);

create table shipments (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers(id),
  courier         text not null,               -- teks bebas dari daftar di settings (JNE, J&T, ...)
  service         text,                        -- REG/YES/dll.
  tracking_number text,                        -- resi; null = belum diserahkan kurir
  shipping_cost_idr integer,
  address_street  text not null,
  address_detail  text,
  city            text not null,
  province        text not null,
  postal_code     text not null,
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);
-- shipments menempel ke CUSTOMER, bukan ke order, supaya gabung-kirim
-- (item dari beberapa order sekaligus) berjalan natural.

create table order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  event_item_id   uuid not null references event_items(id),
  qty             integer not null default 1 check (qty > 0),
  unit_price_idr  integer not null,            -- snapshot harga saat order
  shipping_status item_shipping_status not null default 'not_shipped',
  shipment_id     uuid references shipments(id),  -- null = belum masuk pengiriman
  notes           text
);

create table payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  amount_idr  integer not null check (amount_idr > 0),
  method      payment_method not null,
  proof_url   text,                            -- Supabase Storage (bucket privat)
  status      payment_review_status not null default 'pending',
  paid_at     date,                            -- tanggal transfer menurut customer
  verified_at timestamptz,
  notes       text,
  created_at  timestamptz not null default now()
);

create table book_requests (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id), -- null = pengunjung yang belum pernah order
  customer_name text not null,
  whatsapp      text not null,
  title         text not null,
  isbn          text,
  notes         text,
  status        request_status not null default 'new',
  created_at    timestamptz not null default now()
);

-- Konfigurasi operasional: rekening, nomor WA admin, daftar kurir,
-- teks T&C, default dp_percent per tipe event, dsb.
create table settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Rate limit portabel (docs/05-quota-abuse-protection.md §3 Lapisan 3) — dipakai
-- oleh RPC publik (belum ditambahkan di migrasi ini, lihat milestone M2/M3).
create table rate_limits (
  bucket_key   text not null,
  window_start timestamptz not null,
  hit_count    integer not null default 1,
  primary key (bucket_key, window_start)
);
create index rate_limits_bucket_idx on rate_limits (bucket_key, window_start desc);

create or replace function check_rate_limit(
  p_bucket_key text,
  p_max_hits integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Window tetap (fixed window) sejak epoch, bukan sliding — cukup untuk
  -- kebutuhan ini (docs/05 §3), dan jauh lebih sederhana dari sliding window.
  v_window_start timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_hits integer;
begin
  insert into rate_limits (bucket_key, window_start, hit_count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set hit_count = rate_limits.hit_count + 1
  returning hit_count into v_hits;

  return v_hits <= p_max_hits;
end;
$$;

-- Baris kedaluwarsa dibersihkan harian oleh pg_cron (docs/05 §5) — belum
-- dijadwalkan di migrasi ini, tambahkan saat setup project Supabase asli.

-- =====================
-- INDEX
-- =====================
create index orders_customer_idx  on orders (customer_id);
create index orders_event_idx     on orders (event_id, status);
create index order_items_order_idx on order_items (order_id);
create index order_items_shipment_idx on order_items (shipment_id) where shipment_id is not null;
create index payments_order_idx   on payments (order_id, status);
create index event_items_event_idx on event_items (event_id) where is_active;

-- =====================
-- VIEWS (status turunan)
-- =====================
-- Status pembayaran per order: Not Paid / Partially Paid / Fully Paid / Overpaid (ala Blossom)
create view v_order_payment as
select
  o.id as order_id,
  o.total_idr,
  coalesce(sum(p.amount_idr) filter (where p.status = 'verified'), 0) as paid_idr,
  greatest(o.total_idr - coalesce(sum(p.amount_idr) filter (where p.status = 'verified'), 0), 0) as balance_idr,
  case
    when coalesce(sum(p.amount_idr) filter (where p.status = 'verified'), 0) = 0 then 'not_paid'
    when coalesce(sum(p.amount_idr) filter (where p.status = 'verified'), 0) <  o.total_idr then 'partially_paid'
    when coalesce(sum(p.amount_idr) filter (where p.status = 'verified'), 0) =  o.total_idr then 'fully_paid'
    else 'overpaid'
  end as payment_state
from orders o
left join payments p on p.order_id = o.id
group by o.id, o.total_idr;

-- Piutang per customer (untuk dashboard admin & penagihan)
create view v_customer_balance as
select
  c.id as customer_id, c.code, c.full_name,
  sum(vp.balance_idr) as total_balance_idr,
  count(*) filter (where vp.payment_state in ('not_paid','partially_paid')) as unpaid_orders
from customers c
join orders o  on o.customer_id = c.id and o.status not in ('cancelled')
join v_order_payment vp on vp.order_id = o.id
group by c.id, c.code, c.full_name;

-- =====================
-- RLS (docs/01 §Model akses)
-- =====================
-- Deny-by-default di semua tabel. Dua kelompok kebijakan:
--  1. Katalog (events/event_items/books): publik boleh SELECT read-only.
--  2. Semua tabel lain: TIDAK ADA akses langsung dari anon. Baca/tulis publik
--     (order, payment, tracker, shipping, book request) menunggu RPC
--     `security definer` di milestone M2/M3 — itulah satu-satunya jalan masuk.
-- Admin (satu akun, MVP) diberi akses penuh via policy `authenticated` — belum
-- ada tabel/klaim admin terpisah karena cuma satu admin; kalau nanti multi-admin,
-- ganti kondisi ini dengan klaim/tabel admin, bukan tambah tabel baru sekarang.

alter table customers     enable row level security;
alter table events        enable row level security;
alter table books         enable row level security;
alter table event_items   enable row level security;
alter table orders        enable row level security;
alter table order_items   enable row level security;
alter table shipments     enable row level security;
alter table payments      enable row level security;
alter table book_requests enable row level security;
alter table settings      enable row level security;
alter table rate_limits   enable row level security;

create policy "admin full access" on customers     for all to authenticated using (true) with check (true);
create policy "admin full access" on events        for all to authenticated using (true) with check (true);
create policy "admin full access" on books         for all to authenticated using (true) with check (true);
create policy "admin full access" on event_items   for all to authenticated using (true) with check (true);
create policy "admin full access" on orders        for all to authenticated using (true) with check (true);
create policy "admin full access" on order_items   for all to authenticated using (true) with check (true);
create policy "admin full access" on shipments     for all to authenticated using (true) with check (true);
create policy "admin full access" on payments      for all to authenticated using (true) with check (true);
create policy "admin full access" on book_requests for all to authenticated using (true) with check (true);
create policy "admin full access" on settings      for all to authenticated using (true) with check (true);

create policy "public read catalog books" on books
  for select to anon using (true);

create policy "public read catalog events" on events
  for select to anon using (status not in ('draft', 'cancelled'));

create policy "public read catalog event_items" on event_items
  for select to anon using (
    is_active
    and exists (
      select 1 from events e
      where e.id = event_items.event_id
        and e.status not in ('draft', 'cancelled')
    )
  );
