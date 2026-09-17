-- Temuan uji alur normal (docs/06): tracker tidak menampilkan status order —
-- order selesai hanya tampil "Lunas", dan order batal hilang total sehingga
-- customer tidak tahu order-nya dibatalkan. Tambah order_status & tampilkan
-- order batal (UI menandainya, tanpa aksi bayar/kirim).
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
  order_status order_status,
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
$$;

revoke all on function get_tracker(text) from public;
grant execute on function get_tracker(text) to anon, authenticated;
