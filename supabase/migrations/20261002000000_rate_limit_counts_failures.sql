-- Perbaikan rate limit (temuan 23 Sep, dibuktikan dengan curl: 15 tebakan kode
-- palsu ke get_tracker semuanya lolos walau batasnya 10/menit).
--
-- Akar masalah: `raise exception` membatalkan SELURUH transaksi, termasuk baris
-- rate_limits yang baru ditambah. Jadi setiap jalur yang menjawab "salah" dengan
-- exception tidak pernah terhitung. Jalur "tidak ditemukan" kini dikembalikan
-- sebagai data (kosong/null/matched=false), bukan exception.
--
-- Fungsi dibangun ulang dari definisi live + penggantian terarah.

CREATE OR REPLACE FUNCTION public.get_tracker(p_code text)
 RETURNS TABLE(order_id uuid, order_code text, event_name text, total_idr integer, paid_idr integer, balance_idr integer, payment_state text, order_status order_status, admin_notes text, created_at timestamp with time zone, items jsonb, payments jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not check_rate_limit('track:' || request_ip(), 10, 60) then
    raise exception 'Terlalu banyak percobaan. Coba lagi dalam 1 menit.';
  end if;

  -- Kode tidak ditemukan = hasil kosong, BUKAN exception: exception membatalkan
  -- transaksi termasuk hitungan rate limit, jadi tebakan salah tidak pernah
  -- terhitung. Frontend menampilkan "kode tidak ditemukan" dari hasil kosong.
  return query
  select
    o.id, o.order_code, e.name, o.total_idr,
    vp.paid_idr::integer, vp.balance_idr::integer, vp.payment_state,
    o.status,
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
  where c.code = p_code
  order by o.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_shipment(p_code text, p_whatsapp text, p_order_item_ids uuid[], p_recipient_name text, p_recipient_phone text, p_courier text, p_address_street text, p_address_detail text, p_city text, p_province text, p_postal_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_customer_id uuid;
  v_eligible int;
  v_shipment_id uuid;
begin
  if not check_rate_limit('create_shipment:' || request_ip(), 5, 3600) then
    raise exception 'Terlalu banyak percobaan. Coba lagi nanti.';
  end if;

  v_customer_id := shipping_customer_id(p_code, p_whatsapp);
  -- null (bukan exception) supaya percobaan salah tetap terhitung rate limit.
  if v_customer_id is null then
    return null;
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
$function$;

CREATE OR REPLACE FUNCTION public.submit_payment_proof(p_customer_code text, p_order_code text, p_amount_idr integer, p_method payment_method, p_paid_at date, p_proof_path text)
 RETURNS TABLE(payment_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id uuid;
  v_existing_count int;
begin
  if not check_rate_limit('submit_payment:' || p_customer_code, 5, 3600) then
    raise exception 'Terlalu banyak upload. Coba lagi nanti.';
  end if;
  -- Kuota di atas per kode yang DIKIRIM, jadi tiap tebakan kode dapat kuota
  -- baru. Batas per IP yang menahan tebak-tebakan.
  if not check_rate_limit('submit_payment_ip:' || request_ip(), 10, 3600) then
    raise exception 'Terlalu banyak upload. Coba lagi nanti.';
  end if;

  select o.id into v_order_id
  from orders o
  join customers c on c.id = o.customer_id
  where c.code = p_customer_code and o.order_code = p_order_code and o.status <> 'cancelled';

  -- Hasil kosong, bukan exception: hitungan rate limit harus ikut tersimpan.
  if v_order_id is null then
    return;
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
$function$;

CREATE OR REPLACE FUNCTION public.is_active_order_folder(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from orders
    where id::text = split_part(p_object_name, '/', 1)
      and status <> 'cancelled'
  )
  -- Upload file tidak lewat RPC, jadi rate limit tidak berlaku di sini. Tanpa
  -- batas jumlah, satu order bisa diisi ratusan file 5 MB (kuota storage 1 GB).
  -- 10 = sama dengan batas baris bukti di submit_payment_proof.
  and (
    select count(*) from storage.objects
    where bucket_id = 'payment-proofs'
      and name like split_part(p_object_name, '/', 1) || '/%'
  ) < 10;
$function$;

-- Kembalian berubah jadi jsonb {matched, items}: kode/WA salah dikembalikan
-- sebagai matched=false (bukan exception) supaya hitungan rate limit tersimpan,
-- tapi frontend tetap bisa membedakan "tidak cocok" dari "belum ada buku siap".
drop function get_shippable_items(text, text);
create function get_shippable_items(p_code text, p_whatsapp text)
returns jsonb
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
    return jsonb_build_object('matched', false, 'items', '[]'::jsonb);
  end if;

  return jsonb_build_object('matched', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'order_item_id', oi.id,
      'order_code', o.order_code,
      'title', b.title,
      'qty', oi.qty,
      'eligible', vp.payment_state in ('fully_paid', 'overpaid'),
      'balance_idr', vp.balance_idr::integer
    ) order by o.created_at, b.title)
    from order_items oi
    join orders o on o.id = oi.order_id
    join v_order_payment vp on vp.order_id = o.id
    join event_items ei on ei.id = oi.event_item_id
    join books b on b.id = ei.book_id
    where o.customer_id = v_customer_id
      and o.status <> 'cancelled'
      and oi.shipping_status = 'arrived_in_indo'
      and oi.shipment_id is null
  ), '[]'::jsonb));
end;
$$;

revoke all on function get_shippable_items(text, text) from public;
grant execute on function get_shippable_items(text, text) to anon, authenticated;
