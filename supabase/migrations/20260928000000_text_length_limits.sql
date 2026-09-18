-- Temuan uji abuse 18 Sep (docs/07): judul request buku 100.000 karakter diterima.
-- Rate limit menahan spam berulang, tapi tidak menahan SATU kiriman raksasa.
--
-- Yang dibatasi hanya kolom yang bisa ditulis pengunjung anonim lewat 4 RPC:
-- create_book_request, create_order, create_shipment, submit_payment_proof.
-- Kolom milik admin (customers.notes, orders.admin_notes, books.*, dst) sengaja
-- TIDAK dibatasi — sudah di balik is_admin(), dan batas di situ cuma bikin repot.
--
-- `add check` memvalidasi baris yang sudah ada, jadi nilai kepanjangan dipotong
-- dulu. Di DB bersih semua update ini tidak mengenai baris apa pun.
update book_requests set customer_name = left(customer_name, 100) where length(customer_name) > 100;
update book_requests set whatsapp      = left(whatsapp, 25)       where length(whatsapp) > 25;
update book_requests set title         = left(title, 300)         where length(title) > 300;
update book_requests set isbn          = left(isbn, 20)           where length(isbn) > 20;
update book_requests set notes         = left(notes, 1000)        where length(notes) > 1000;

update customers set full_name = left(full_name, 100) where length(full_name) > 100;
update customers set whatsapp  = left(whatsapp, 25)   where length(whatsapp) > 25;
update customers set instagram = left(instagram, 50)  where length(instagram) > 50;

update orders set customer_notes = left(customer_notes, 1000) where length(customer_notes) > 1000;

update shipments set recipient_name  = left(recipient_name, 100)  where length(recipient_name) > 100;
update shipments set recipient_phone = left(recipient_phone, 25)  where length(recipient_phone) > 25;
update shipments set courier         = left(courier, 50)          where length(courier) > 50;
update shipments set address_street  = left(address_street, 500)  where length(address_street) > 500;
update shipments set address_detail  = left(address_detail, 300)  where length(address_detail) > 300;
update shipments set city            = left(city, 100)            where length(city) > 100;
update shipments set province        = left(province, 100)        where length(province) > 100;
update shipments set postal_code     = left(postal_code, 10)      where length(postal_code) > 10;

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
