-- Masukan client: penerbit buku perlu terlihat (edisi US vs UK beda harga & isi).
-- Milik tabel books (bukan event_items): penerbit melekat ke edisinya, sama
-- seperti judul/penulis/ISBN, jadi ikut berubah lintas batch.
alter table books add column publisher text;

-- import_catalog_csv dipakai import CSV dan form "tambah buku manual".
-- Didefinisikan ulang penuh (badan 20260917 + cek is_admin dari 20260921),
-- ditambah kolom publisher.
create or replace function import_catalog_csv(
  p_event_id uuid,
  p_rows jsonb  -- array of {isbn?, title, author?, publisher?, format?, price_idr, stock?}
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
  v_publisher text;
  v_format book_format;
  v_price integer;
  v_stock integer;
  v_book_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_idx := v_idx + 1;
    begin
      v_isbn      := nullif(trim(v_row->>'isbn'), '');
      v_title     := nullif(trim(v_row->>'title'), '');
      v_author    := nullif(trim(v_row->>'author'), '');
      v_publisher := nullif(trim(v_row->>'publisher'), '');
      v_format    := coalesce(nullif(trim(v_row->>'format'), '')::book_format, 'paperback');
      v_price     := nullif(v_row->>'price_idr', '')::integer;
      v_stock     := nullif(v_row->>'stock', '')::integer;

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
        insert into books (isbn, title, author, publisher, format)
        values (v_isbn, v_title, v_author, v_publisher, v_format)
        returning id into v_book_id;
      else
        update books set title = v_title,
                         author = coalesce(v_author, books.author),
                         publisher = coalesce(v_publisher, books.publisher)
        where id = v_book_id;
      end if;

      insert into event_items (event_id, book_id, price_idr, stock)
      values (p_event_id, v_book_id, v_price, v_stock)
      on conflict (event_id, book_id)
      do update set price_idr = excluded.price_idr, stock = excluded.stock, is_active = true;

      csv_row_number := v_idx; status := 'ok'; message := null; isbn := v_isbn; title := v_title;
      return next;
    exception when others then
      -- Exception block = savepoint implisit: baris ini di-rollback, baris lain lanjut (R16).
      csv_row_number := v_idx; status := 'error'; message := sqlerrm;
      isbn := v_row->>'isbn'; title := v_row->>'title';
      return next;
    end;
  end loop;
  return;
end;
$$;

-- Tipe kembalian berubah → harus drop dulu, lalu grant dipasang ulang.
drop function get_catalogue(uuid);
create function get_catalogue(p_event_id uuid)
returns table (
  event_item_id uuid,
  isbn text,
  title text,
  author text,
  publisher text,
  format book_format,
  cover_url text,
  price_idr integer,
  stock_left integer  -- null = PO tanpa batas
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ei.id, b.isbn, b.title, b.author, b.publisher, b.format, b.cover_url, ei.price_idr,
    case when ei.stock is null then null
         else greatest(ei.stock - coalesce((
           select sum(oi.qty) from order_items oi
           join orders o on o.id = oi.order_id
           where oi.event_item_id = ei.id and o.status <> 'cancelled'
         ), 0), 0)::integer
    end
  from event_items ei
  join books b on b.id = ei.book_id
  join events e on e.id = ei.event_id
  where ei.event_id = p_event_id
    and ei.is_active
    and e.status not in ('draft', 'cancelled')
  order by b.title;
$$;

revoke all on function get_catalogue(uuid) from public;
grant execute on function get_catalogue(uuid) to anon, authenticated;
