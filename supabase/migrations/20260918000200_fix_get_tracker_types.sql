-- Fix: v_order_payment.paid_idr/balance_idr adalah bigint (hasil SUM()),
-- bukan integer — cast eksplisit supaya cocok dengan RETURNS TABLE get_tracker.
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
    o.id, o.order_code, e.name, o.total_idr,
    vp.paid_idr::integer, vp.balance_idr::integer, vp.payment_state,
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
