-- Rekap PDF di Lacak Order (masukan client 5 Okt) butuh harga satuan per buku.
-- Hanya menambah 'unit_price_idr' ke json items; signature & kolom lain sama,
-- jadi frontend lama tetap jalan. Sisanya disalin apa adanya dari 20261002.

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
        'tracking_number', s.tracking_number, 'courier', s.courier,
        'unit_price_idr', oi.unit_price_idr
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
