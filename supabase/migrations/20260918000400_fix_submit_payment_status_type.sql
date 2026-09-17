-- Fix: payments.status adalah enum payment_review_status, bukan text.
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
