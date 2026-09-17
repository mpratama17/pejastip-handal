-- Halaman Event (edit + jadwal). Aturan ditegakkan di DB, bukan cuma di form.

alter table events add constraint events_dp_percent_range check (dp_percent between 0 and 100);
alter table events add constraint events_close_after_open
  check (closes_at is null or opens_at is null or closes_at > opens_at);

-- create_order: batch berstatus open tapi di luar jadwal (belum buka / sudah
-- lewat tanggal tutup) tidak menerima order. Sebelumnya hanya status yang dicek,
-- jadi tanggal tutup yang tampil di web tidak berarti apa-apa.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('create_order(uuid,text,text,text,uuid,jsonb,text,text)'::regprocedure);
  if position('if not found or v_event.status <> ''open'' then' in v_def) = 0 then
    raise exception 'pola cek event di create_order tidak ditemukan';
  end if;
  execute replace(v_def,
    'if not found or v_event.status <> ''open'' then',
    'if not found or v_event.status <> ''open''
       or v_event.closes_at <= now() or v_event.opens_at > now() then');
end $$;
