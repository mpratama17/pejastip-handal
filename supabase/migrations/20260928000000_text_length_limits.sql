-- Temuan uji abuse 18 Sep (docs/07): judul request buku 100.000 karakter diterima.
-- Rate limit menahan spam berulang, tapi tidak menahan SATU kiriman raksasa.
--
-- Yang dibatasi hanya kolom yang bisa ditulis pengunjung anonim lewat 4 RPC:
-- create_book_request, create_order, create_shipment, submit_payment_proof.
-- Kolom milik admin (customers.notes, orders.admin_notes, books.*, dst) sengaja
-- TIDAK dibatasi — sudah di balik is_admin(), dan batas di situ cuma bikin repot.
--
-- PENTING: jalankan dulu SQL pembersih di docs/07 (baris uji 100rb karakter),
-- kalau tidak `add check` gagal karena memvalidasi baris yang sudah ada.

alter table book_requests
  add constraint book_requests_text_len check (
    length(customer_name) <= 100
    and length(whatsapp) <= 25
    and length(title) <= 300
    and (isbn is null or length(isbn) <= 20)
    and (notes is null or length(notes) <= 1000)
  );

alter table customers
  add constraint customers_text_len check (
    length(full_name) <= 100
    and length(whatsapp) <= 25
    and (instagram is null or length(instagram) <= 50)
  );

alter table orders
  add constraint orders_customer_notes_len check (
    customer_notes is null or length(customer_notes) <= 1000
  );

alter table shipments
  add constraint shipments_text_len check (
    length(recipient_name) <= 100
    and length(recipient_phone) <= 25
    and length(courier) <= 50
    and length(address_street) <= 500
    and (address_detail is null or length(address_detail) <= 300)
    and length(city) <= 100
    and length(province) <= 100
    and length(postal_code) <= 10
  );
