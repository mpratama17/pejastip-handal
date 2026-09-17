-- Fixture lokal untuk dev — bukan data produksi. Judul buku FIKTIF (bukan
-- katalog asli Blossom), konsisten dengan style tile desain.

-- Settings dasar (§7 white-label — nama toko/rekening/WA/kurir tinggal di sini)
insert into settings (key, value) values
  ('store_name', '"Pejastip Handal"'),
  ('wa_admin_number', '"+6281234567890"'),
  ('bank_accounts', '[{"bank":"BCA","account_number":"1234567890","holder":"Pejastip Handal"}]'),
  ('couriers', '["JNE", "J&T", "SiCepat", "Anteraja"]'),
  ('default_dp_percent', '{"publisher_po_us":35,"publisher_po_uk":35,"ready_stock":100,"secondhand":50,"special_edition":50,"bbw_jastip":100,"other":35}');

-- Events: satu batch PO terbuka (punya katalog → tampil di order form),
-- satu ready stock TANPA katalog (lihat docs/02 §"Event tanpa katalog"),
-- satu batch historis selesai (untuk uji v_customer_balance).
-- Id pakai digit kategori di awal (1=event, 2=book, 3=event_item, 4=customer,
-- 5=order) supaya tetap valid UUID (huruf hex cuma a-f) — bukan mnemonic huruf.
insert into events (id, name, type, status, dp_percent, payment_due_hours, eta_note, opens_at, closes_at) values
  ('10000000-0000-0000-0000-000000000001', 'PO Amerika #14 — Romantasy Winter', 'publisher_po_us', 'open', 35, null, '6-8 minggu (udara)', now() - interval '2 days', now() + interval '12 days'),
  ('10000000-0000-0000-0000-000000000002', 'Ready Stock Gudang — Batch Sep', 'ready_stock', 'open', 100, 48, 'siap kirim minggu ini', now() - interval '1 day', now() + interval '5 days'),
  ('10000000-0000-0000-0000-000000000003', 'PO Amerika #12 — Contemporary', 'publisher_po_us', 'completed', 35, null, 'selesai', now() - interval '90 days', now() - interval '75 days');

-- Event tanpa katalog: sengaja TIDAK ada event_items untuk event 2 (ready
-- stock ini order-nya via WA, bukan web) — jadi tidak muncul di dropdown
-- order form, tapi tetap tampil di /ongoing.

-- Sampul contoh ada di public/books/ (tidak ikut repo — karya penerbit).
-- Di project Supabase, sampul sudah dipindah ke bucket publik `book-covers`
-- lewat tombol Unggah di /admin/books; seed ini memakai path lokal saja.
insert into books (id, isbn, title, author, format, cover_url) values
  ('20000000-0000-0000-0000-000000000001', '9780000000011', 'Atomic Habits', 'James Clear', 'paperback', '/books/atomic-habits.jpg'),
  ('20000000-0000-0000-0000-000000000002', '9780000000028', 'Filosofi Teras', 'Henry Manampiring', 'hardcover', '/books/filosofi-teras.jpg'),
  ('20000000-0000-0000-0000-000000000003', '9780000000035', 'Hujan', 'Tere Liye', 'paperback', '/books/hujan.jpg'),
  ('20000000-0000-0000-0000-000000000004', null, 'Malioboro at Midnight', 'Skysphire', 'paperback', '/books/malioboro-at-midnight.jpg'),
  ('20000000-0000-0000-0000-000000000005', null, 'Seporsi Mie Ayam Sebelum Mati', 'Brian Khrisna', 'paperback', '/books/seporsi-mie-ayam.jpg');

insert into event_items (id, event_id, book_id, price_idr, stock, is_active) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 185000, null, true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 210000, null, true),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 195000, null, true),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 175000, null, true),
  -- stok terbatas & habis: buat menguji label stok di katalog
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 115000, 5, true),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 98000, 0, true);

-- Customer + order contoh, dipakai untuk uji tracker/v_order_payment secara manual.
insert into customers (id, code, full_name, whatsapp, instagram) values
  ('40000000-0000-0000-0000-000000000001', 'RIN8K2Q1', 'Rina Wijaya', '+6281111111111', '@rina.reads');

insert into orders (id, order_code, customer_id, event_id, status, subtotal_idr) values
  ('50000000-0000-0000-0000-000000000001', 'ORD-2609-0001', '40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'confirmed', 395000);

insert into order_items (order_id, event_item_id, qty, unit_price_idr, shipping_status) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1, 185000, 'shipped_to_indo'),
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 1, 210000, 'not_shipped');

insert into payments (order_id, amount_idr, method, status, paid_at, verified_at) values
  ('50000000-0000-0000-0000-000000000001', 138250, 'bank_transfer', 'verified', current_date - 1, now() - interval '20 hours');
-- 138.250 = 35% DP dari 395.000 → payment_state harus 'partially_paid', balance 256.750.
