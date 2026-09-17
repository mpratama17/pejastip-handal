-- R15 (override status per buku) + R17 (edit item order) — docs/03-prd.md §3.5/3.7

-- Diskon tidak boleh membuat total negatif (edit item bisa menurunkan subtotal).
alter table orders add constraint orders_discount_le_subtotal check (discount_idr <= subtotal_idr);

-- Satu baris per buku per order; create_order dulu tidak menolak duplikat di payload.
create unique index order_items_order_event_item_uniq on order_items (order_id, event_item_id);

-- =====================
-- R17 — edit item order
-- =====================
-- p_items = daftar akhir buku yang BELUM diproses kirim: [{event_item_id, qty}].
-- Buku yang sudah masuk shipment / status bukan not_shipped tidak disentuh
-- (UI menampilkannya read-only). Harga lama dipertahankan untuk buku yang
-- sudah ada; buku baru memakai harga batch saat ini.
create or replace function admin_update_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_ei event_items%rowtype;
  v_qty int;
  v_old_prices jsonb;
  v_subtotal int;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order tidak ditemukan.';
  end if;
  if v_order.status in ('cancelled', 'completed') then
    raise exception 'Order yang sudah batal/selesai tidak bisa diubah.';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Format item tidak valid.';
  end if;
  if (select count(*) <> count(distinct e->>'event_item_id') from jsonb_array_elements(p_items) e) then
    raise exception 'Buku yang sama tercantum dua kali.';
  end if;

  select coalesce(jsonb_object_agg(event_item_id::text, unit_price_idr), '{}') into v_old_prices
  from order_items
  where order_id = p_order_id and shipment_id is null and shipping_status = 'not_shipped';

  delete from order_items
  where order_id = p_order_id and shipment_id is null and shipping_status = 'not_shipped';

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := nullif(v_item->>'qty', '')::int;
    if v_qty is null or v_qty < 1 then
      raise exception 'Qty tidak valid.';
    end if;

    select * into v_ei from event_items
    where id = (v_item->>'event_item_id')::uuid and event_id = v_order.event_id
    for update;
    if not found then
      raise exception 'Buku tidak ada di batch order ini.';
    end if;
    if exists (select 1 from order_items where order_id = p_order_id and event_item_id = v_ei.id) then
      raise exception 'Buku yang sudah diproses kirim tidak bisa diubah.';
    end if;

    -- Buku baru harus masih aktif; buku lama boleh tetap walau sudah dinonaktifkan.
    if not v_old_prices ? v_ei.id::text and not v_ei.is_active then
      raise exception 'Buku yang dinonaktifkan tidak bisa ditambahkan.';
    end if;

    if v_ei.stock is not null and v_ei.stock < v_qty + coalesce((
      select sum(oi.qty) from order_items oi
      join orders o on o.id = oi.order_id
      where oi.event_item_id = v_ei.id and o.status <> 'cancelled' and o.id <> p_order_id
    ), 0) then
      raise exception 'Stok tidak cukup untuk salah satu buku.';
    end if;

    insert into order_items (order_id, event_item_id, qty, unit_price_idr)
    values (p_order_id, v_ei.id, v_qty,
            coalesce((v_old_prices ->> v_ei.id::text)::int, v_ei.price_idr));
  end loop;

  select coalesce(sum(qty * unit_price_idr), 0) into v_subtotal from order_items where order_id = p_order_id;
  if v_subtotal = 0 then
    raise exception 'Order minimal berisi satu buku. Batalkan order kalau semua buku dihapus.';
  end if;
  if v_subtotal < v_order.discount_idr then
    raise exception 'Subtotal baru lebih kecil dari diskon. Kurangi diskon dulu.';
  end if;

  update orders set subtotal_idr = v_subtotal where id = p_order_id;
end;
$$;

-- =====================
-- R15 — override status satu buku (mis. tertinggal dari batch-nya)
-- =====================
-- Hanya status perjalanan ke Indonesia. Status kirim ke customer
-- (waiting_courier/shipped/delivered) dikelola lewat shipment.
create or replace function admin_set_item_status(p_item_id uuid, p_status item_shipping_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('not_shipped', 'shipped_to_indo', 'arrived_in_indo') then
    raise exception 'Status ini diatur lewat halaman Pengiriman.';
  end if;

  update order_items set shipping_status = p_status
  where id = p_item_id and shipment_id is null;
  if not found then
    raise exception 'Buku sudah masuk pengiriman; ubah lewat halaman Pengiriman.';
  end if;
end;
$$;

revoke all on function admin_update_order_items(uuid, jsonb) from public, anon;
revoke all on function admin_set_item_status(uuid, item_shipping_status) from public, anon;
grant execute on function admin_update_order_items(uuid, jsonb) to authenticated;
grant execute on function admin_set_item_status(uuid, item_shipping_status) to authenticated;
