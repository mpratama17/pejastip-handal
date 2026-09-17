-- Order manual oleh admin (docs/02 §Event tanpa katalog): order yang masuk
-- lewat WhatsApp tetap tercatat di sistem.
--
-- p_items: [{event_item_id, qty}] untuk buku katalog, atau
--          [{title, price_idr, qty}] untuk buku di luar katalog. Buku manual
--          disimpan sebagai event_item NONAKTIF → tidak tampil di katalog publik
--          (RLS & get_catalogue hanya membaca yang aktif).
create or replace function admin_create_order(
  p_idempotency_key uuid,
  p_whatsapp text,
  p_full_name text,
  p_event_id uuid,
  p_items jsonb,
  p_admin_notes text
) returns table (order_id uuid, order_code text, customer_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_wa text;
  v_customer customers%rowtype;
  v_event events%rowtype;
  v_item jsonb;
  v_ei event_items%rowtype;
  v_book_id uuid;
  v_qty int;
  v_price int;
  v_title text;
  v_subtotal int := 0;
  v_order_code text;
  v_attempt int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select o.id into v_order_id from orders o where o.idempotency_key = p_idempotency_key;

  if v_order_id is null then
    v_wa := normalize_whatsapp(p_whatsapp);
    if v_wa is null or v_wa !~ '^\+62\d{8,13}$' then
      raise exception 'Nomor WhatsApp tidak valid.';
    end if;

    select * into v_event from events where id = p_event_id;
    if not found or v_event.status in ('draft', 'completed', 'cancelled') then
      raise exception 'Batch tidak ditemukan atau sudah tidak aktif.';
    end if;

    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'Belum ada buku.';
    end if;
    if (select count(*) filter (where e ? 'event_item_id')
               <> count(distinct e->>'event_item_id') filter (where e ? 'event_item_id')
        from jsonb_array_elements(p_items) e) then
      raise exception 'Buku yang sama tercantum dua kali.';
    end if;

    select * into v_customer from customers where whatsapp = v_wa;
    if found then
      if v_customer.is_blacklisted then
        raise exception 'Customer ini di-blacklist: %', v_customer.blacklist_reason;
      end if;
    else
      if nullif(trim(p_full_name), '') is null then
        raise exception 'Nama customer baru wajib diisi.';
      end if;
      for v_attempt in 1..5 loop
        begin
          insert into customers (code, full_name, whatsapp)
          values (generate_customer_code(), trim(p_full_name), v_wa)
          returning * into v_customer;
          exit;
        exception when unique_violation then
          if v_attempt = 5 then raise; end if;
        end;
      end loop;
    end if;

    v_order_code := 'ORD-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('order_code_seq')::text, 4, '0');
    insert into orders (order_code, customer_id, event_id, subtotal_idr, admin_notes, idempotency_key)
    values (v_order_code, v_customer.id, p_event_id, 0, nullif(trim(p_admin_notes), ''), p_idempotency_key)
    returning id into v_order_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_qty := nullif(v_item->>'qty', '')::int;
      if v_qty is null or v_qty < 1 then
        raise exception 'Qty tidak valid.';
      end if;

      if v_item ? 'event_item_id' then
        select * into v_ei from event_items
        where id = (v_item->>'event_item_id')::uuid and event_id = p_event_id
        for update;
        if not found then
          raise exception 'Buku tidak ada di batch ini.';
        end if;
        if v_ei.stock is not null and v_ei.stock < v_qty + coalesce((
          select sum(oi.qty) from order_items oi
          join orders o on o.id = oi.order_id
          where oi.event_item_id = v_ei.id and o.status <> 'cancelled'
        ), 0) then
          raise exception 'Stok tidak cukup untuk salah satu buku.';
        end if;
      else
        v_title := nullif(trim(v_item->>'title'), '');
        v_price := nullif(v_item->>'price_idr', '')::int;
        if v_title is null or v_price is null or v_price < 0 then
          raise exception 'Buku manual butuh judul dan harga.';
        end if;
        -- Pakai ulang buku dengan judul sama (tanpa ISBN) supaya master buku tidak berlipat.
        select id into v_book_id from books where lower(title) = lower(v_title) and isbn is null limit 1;
        if v_book_id is null then
          insert into books (title) values (v_title) returning id into v_book_id;
        end if;
        select * into v_ei from event_items where event_id = p_event_id and book_id = v_book_id;
        if not found then
          insert into event_items (event_id, book_id, price_idr, is_active)
          values (p_event_id, v_book_id, v_price, false)
          returning * into v_ei;
        end if;
        if exists (select 1 from order_items where order_id = v_order_id and event_item_id = v_ei.id) then
          raise exception 'Buku "%" tercantum dua kali.', v_title;
        end if;
      end if;

      -- Buku manual: harga yang diketik admin; buku katalog: harga batch.
      v_price := case when v_item ? 'event_item_id' then v_ei.price_idr else v_price end;
      insert into order_items (order_id, event_item_id, qty, unit_price_idr)
      values (v_order_id, v_ei.id, v_qty, v_price);
      v_subtotal := v_subtotal + v_price * v_qty;
    end loop;

    update orders set subtotal_idr = v_subtotal where id = v_order_id;
  end if;

  return query
  select o.id, o.order_code, c.code
  from orders o join customers c on c.id = o.customer_id
  where o.id = v_order_id;
end;
$$;

revoke all on function admin_create_order(uuid, text, text, uuid, jsonb, text) from public, anon;
grant execute on function admin_create_order(uuid, text, text, uuid, jsonb, text) to authenticated;
