-- RPC admin inti: bulk update status event (docs/03-prd.md R14/R15) dan
-- import katalog CSV (R16). Keduanya security definer, menurunkan hak dari
-- auth.role() = 'authenticated' — bukan dari parameter klien (lesson sirviu
-- di CLAUDE.md: trust boundary di RPC, bukan komponen).

-- =====================
-- R14/R15 — bulk update status event + cascade item
-- =====================
create or replace function admin_set_event_status(
  p_event_id uuid,
  p_new_status event_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update events set status = p_new_status where id = p_event_id;

  -- Mapping default (R14) — item ber-status lebih maju tidak pernah
  -- dimundurkan; admin bisa override per item terpisah (R15, belum di RPC ini).
  if p_new_status = 'shipped_to_indo' then
    update order_items oi
    set shipping_status = 'shipped_to_indo'
    from orders o
    where oi.order_id = o.id
      and o.event_id = p_event_id
      and oi.shipping_status = 'not_shipped';
  elsif p_new_status = 'arrived' then
    update order_items oi
    set shipping_status = 'arrived_in_indo'
    from orders o
    where oi.order_id = o.id
      and o.event_id = p_event_id
      and oi.shipping_status = 'shipped_to_indo';
  end if;
end;
$$;

revoke all on function admin_set_event_status(uuid, event_status) from public;
grant execute on function admin_set_event_status(uuid, event_status) to authenticated;

-- =====================
-- R16 — import katalog CSV (upsert per ISBN, laporan per baris, idempoten)
-- =====================
create or replace function import_catalog_csv(
  p_event_id uuid,
  p_rows jsonb  -- array of {isbn?, title, author?, format?, price_idr, stock?}
) returns table (
  csv_row_number integer,
  status text,   -- 'ok' | 'error'
  message text,
  isbn text,
  title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_idx integer := 0;
  v_isbn text;
  v_title text;
  v_author text;
  v_format book_format;
  v_price integer;
  v_stock integer;
  v_book_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    begin
      v_isbn   := nullif(trim(v_row->>'isbn'), '');
      v_title  := nullif(trim(v_row->>'title'), '');
      v_author := nullif(trim(v_row->>'author'), '');
      v_format := coalesce(nullif(trim(v_row->>'format'), '')::book_format, 'paperback');
      v_price  := nullif(v_row->>'price_idr', '')::integer;
      v_stock  := nullif(v_row->>'stock', '')::integer;

      if v_title is null then
        raise exception 'title wajib diisi';
      end if;
      if v_price is null or v_price < 0 then
        raise exception 'price_idr tidak valid';
      end if;

      if v_isbn is not null then
        select b.id into v_book_id from books b where b.isbn = v_isbn;
      else
        v_book_id := null;
      end if;

      if v_book_id is null then
        insert into books (isbn, title, author, format)
        values (v_isbn, v_title, v_author, v_format)
        returning id into v_book_id;
      else
        update books set title = v_title, author = coalesce(v_author, books.author)
        where id = v_book_id;
      end if;

      insert into event_items (event_id, book_id, price_idr, stock)
      values (p_event_id, v_book_id, v_price, v_stock)
      on conflict (event_id, book_id)
      do update set price_idr = excluded.price_idr, stock = excluded.stock, is_active = true;

      csv_row_number := v_idx; status := 'ok'; message := null; isbn := v_isbn; title := v_title;
      return next;
    exception when others then
      -- Exception block = savepoint implisit: insert/update baris ini
      -- di-rollback, baris lain tetap lanjut (R16).
      csv_row_number := v_idx; status := 'error'; message := sqlerrm;
      isbn := v_row->>'isbn'; title := v_row->>'title';
      return next;
    end;
  end loop;
  return;
end;
$$;

revoke all on function import_catalog_csv(uuid, jsonb) from public;
grant execute on function import_catalog_csv(uuid, jsonb) to authenticated;
