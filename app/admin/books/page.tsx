"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { parseSimpleCSV } from "@/lib/csv";
import { BOOK_FORMAT_LABEL } from "@/lib/labels";
import { compressImage } from "@/lib/compress-image";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { BookCover } from "@/components/public/book-cover";
import { SortTh, sortRows, useSort } from "@/components/admin/sortable";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type BookFormat = Database["public"]["Enums"]["book_format"];
type BookRow = Database["public"]["Tables"]["books"]["Row"];
type EventItemWithBook = Database["public"]["Tables"]["event_items"]["Row"] & {
  books: BookRow;
};
type ImportResult = Database["public"]["Functions"]["import_catalog_csv"]["Returns"][number];

const FORMATS: BookFormat[] = ["paperback", "hardcover", "boxset", "other"];

type BookSortKey = "title" | "author" | "format" | "price" | "stock" | "created";

type BookFields = { title: string; author: string | null; isbn: string | null; format: BookFormat };

export default function AdminBooksPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [items, setItems] = useState<EventItemWithBook[]>([]);
  const [search, setSearch] = useState("");
  const { sort, onSort } = useSort<BookSortKey>({ key: "title", dir: "asc" });
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [manual, setManual] = useState({
    isbn: "",
    title: "",
    author: "",
    format: "paperback" as BookFormat,
    price_idr: "",
    stock: "",
  });
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const found = q
      ? items.filter((i) => [i.books.title, i.books.author, i.books.isbn].some((v) => v?.toLowerCase().includes(q)))
      : items;
    return sortRows(found, sort, (i, key) =>
      key === "title" ? i.books.title
      : key === "author" ? i.books.author
      : key === "format" ? BOOK_FORMAT_LABEL[i.books.format]
      : key === "price" ? i.price_idr
      : key === "stock" ? (i.stock ?? Number.POSITIVE_INFINITY) // ∞ itu stok terbanyak, bukan data kosong
      : i.books.created_at,
    );
  }, [items, search, sort]);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualOk, setManualOk] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEvents(data ?? []);
        // ?event= dari tombol "Katalog" di halaman Event
        const preset = new URLSearchParams(window.location.search).get("event");
        const pick = data?.find((e) => e.id === preset) ?? data?.[0];
        if (pick) setEventId(pick.id);
      });
  }, []);

  async function loadItems(id: string) {
    const { data } = await supabase
      .from("event_items")
      .select("*, books(*)")
      .eq("event_id", id)
      .order("title", { referencedTable: "books" });
    setItems((data as unknown as EventItemWithBook[]) ?? []);
  }

  useEffect(() => {
    if (eventId) loadItems(eventId);
  }, [eventId]);

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) return;
    setManualError(null);
    setManualOk(null);
    // Dikunci sebelum lookup ISBN, bukan sesudah: lookup-nya sudah satu
    // perjalanan ke server, dan tombol yang masih hidup selama itu bisa
    // menjalankan handler ini dua kali.
    setSavingManual(true);

    // import_catalog_csv memakai ISBN sebagai kunci: kalau ISBN-nya sudah ada,
    // buku itu yang di-update — judul, penulis, harga ikut tertimpa di SEMUA
    // batch yang memakainya. Untuk impor CSV ulang itu memang yang diinginkan,
    // tapi form ini bunyinya "tambah buku", jadi salah ketik satu digit ISBN
    // bisa menimpa buku lain tanpa suara. Sebutkan bukunya dulu.
    const typedIsbn = manual.isbn.trim();
    if (typedIsbn) {
      const { data: bentrok } = await supabase
        .from("books")
        .select("title, author")
        .eq("isbn", typedIsbn)
        .limit(1);
      const lama = bentrok?.[0];
      if (lama && lama.title !== manual.title.trim()) {
        const ok = await confirm({
          title: "ISBN ini sudah dipakai buku lain",
          body:
            `ISBN ${typedIsbn} terdaftar sebagai "${lama.title}"${lama.author ? ` — ${lama.author}` : ""}.\n\n` +
            `Melanjutkan akan mengubah judulnya jadi "${manual.title.trim()}" di semua batch yang memakai buku itu, ` +
            `bukan menambah buku baru.\n\nBatalkan kalau ISBN-nya salah ketik.`,
          confirmLabel: "Ya, ubah buku itu",
          tone: "danger",
        });
        if (!ok) {
          setSavingManual(false);
          return;
        }
      }
    }

    const { data: rows, error } = await supabase.rpc("import_catalog_csv", {
      p_event_id: eventId,
      p_rows: [
        {
          isbn: manual.isbn || undefined,
          title: manual.title,
          author: manual.author || undefined,
          format: manual.format,
          price_idr: manual.price_idr,
          stock: manual.stock || undefined,
        },
      ],
    });

    if (error) {
      setSavingManual(false);
      setManualError(error.message);
      return;
    }
    const result = rows?.[0];
    if (result?.status === "error") {
      setSavingManual(false);
      setManualError(result.message ?? "Gagal menyimpan.");
      return;
    }

    // Sampul baru bisa diunggah setelah bukunya punya id (path-nya `{book_id}.ext`),
    // jadi urutannya: simpan buku dulu, baru unggah. ISBN unik → cari lewat itu
    // kalau ada; kalau tidak, ambil buku berjudul sama yang paling baru dibuat.
    if (coverFile) {
      const isbn = manual.isbn.trim();
      const q = supabase.from("books").select("id");
      const { data: found } = isbn
        ? await q.eq("isbn", isbn).limit(1)
        : await q.eq("title", manual.title.trim()).order("created_at", { ascending: false }).limit(1);
      const bookId = found?.[0]?.id;
      if (!bookId) {
        setManualError("Buku tersimpan, tapi sampulnya gagal dipasang: buku tidak ketemu. Pakai tombol Unggah di tabel.");
      } else {
        const err = await uploadCover(bookId, coverFile);
        if (err) setManualError(`Buku tersimpan, tapi sampul gagal diunggah: ${err}`);
      }
    }

    setSavingManual(false);
    setManualOk(`"${manual.title.trim()}" masuk ke katalog${coverFile ? " beserta sampulnya" : ""}.`);
    setManual({ isbn: "", title: "", author: "", format: "paperback", price_idr: "", stock: "" });
    setCoverFile(null);
    loadItems(eventId);
  }

  async function handleCSVFile(file: File) {
    if (!eventId) return;
    const text = await file.text();
    const rows = parseSimpleCSV(text);
    if (rows.length === 0) return;

    setImporting(true);
    setImportError(null);
    setImportResults([]);
    const { data, error } = await supabase.rpc("import_catalog_csv", {
      p_event_id: eventId,
      p_rows: rows,
    });
    setImporting(false);
    if (error) {
      setImportError(`Import gagal: ${error.message}`);
      return;
    }
    setImportResults(data ?? []);
    loadItems(eventId);
  }

  async function toggleActive(item: EventItemWithBook) {
    await supabase.from("event_items").update({ is_active: !item.is_active }).eq("id", item.id);
    loadItems(eventId);
  }

  // Harga di order lama tidak ikut berubah: order_items.unit_price_idr adalah snapshot.
  async function saveRow(item: EventItemWithBook, book: BookFields, price: number, stock: number | null) {
    setRowError(null);
    const bookRes = await supabase.from("books").update(book).eq("id", item.book_id);
    if (bookRes.error) {
      // 23505 = books_isbn_unique. ISBN dipakai buku lain.
      return setRowError(
        bookRes.error.code === "23505"
          ? `ISBN ${book.isbn} sudah dipakai buku lain. Pakai ISBN berbeda, atau kosongkan.`
          : `Gagal simpan data buku: ${bookRes.error.message}`,
      );
    }
    const { error } = await supabase.from("event_items").update({ price_idr: price, stock }).eq("id", item.id);
    if (error) return setRowError(`Gagal simpan harga/stok: ${error.message}`);
    setEditing(null);
    loadItems(eventId);
  }

  async function removeRow(item: EventItemWithBook) {
    const ok = await confirm({
      title: "Hapus buku dari batch ini?",
      body: `${item.books.title}\n\nBuku tetap ada di daftar buku, hanya dikeluarkan dari batch ini.`,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    setRowError(null);
    const { error } = await supabase.from("event_items").delete().eq("id", item.id);
    // 23503 = masih dipakai order_items. Itu memang harus ditolak.
    if (error) {
      setRowError(
        error.code === "23503"
          ? `"${item.books.title}" sudah masuk order pelanggan, jadi tidak bisa dihapus. Set Nonaktif saja supaya hilang dari katalog.`
          : `Gagal hapus: ${error.message}`,
      );
      return;
    }
    loadItems(eventId);
  }

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-ink">Katalog</h1>

      <div className="mt-4 max-w-xs">
        <label className="block text-sm font-medium text-ink">Event</label>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
      </div>

      {eventId && (
        <>
          <div className="mt-6 rounded-lg border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Import CSV</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Kolom: <code>isbn,title,author,format,price_idr,stock</code>. ISBN yang sudah ada dipakai ulang
              (tidak duplikat) — aman diimport ulang.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCSVFile(file);
                e.target.value = "";
              }}
              className="mt-3 text-sm"
            />
            {importing && <p className="mt-2 text-sm text-ink-muted">Mengimpor…</p>}
            {importError && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {importError}
              </p>
            )}
            {importResults.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="border-b border-ink bg-surface-sunken text-left">
                    <tr>
                      <th className="px-3 py-1.5">Baris</th>
                      <th className="px-3 py-1.5">Status</th>
                      <th className="px-3 py-1.5">Judul</th>
                      <th className="px-3 py-1.5">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResults.map((r) => (
                      <tr key={r.csv_row_number} className="border-t-1 border-line">
                        <td className="px-3 py-1.5">{r.csv_row_number}</td>
                        <td className={`px-3 py-1.5 font-medium ${r.status === "ok" ? "text-success" : "text-danger"}`}>
                          {r.status === "ok" ? "OK" : "Error"}
                        </td>
                        <td className="px-3 py-1.5">{r.title ?? "—"}</td>
                        <td className="px-3 py-1.5 text-ink-muted">{r.message ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pesan sukses milik buku yang barusan masuk. Begitu form disentuh
              lagi dia jadi bohong, jadi dihapus di sentuhan pertama — bukan cuma
              di submit berikutnya, karena validasi browser bisa menahan submit
              dan pesan lama tetap terpampang di atas buku yang belum tersimpan. */}
          <form
            onSubmit={handleManualAdd}
            onChange={() => setManualOk(null)}
            className="mt-6 rounded-lg border border-border bg-surface p-5"
          >
            <h2 className="text-sm font-semibold text-ink">Tambah buku manual</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <input
                placeholder="ISBN (opsional)"
                value={manual.isbn}
                onChange={(e) => setManual({ ...manual, isbn: e.target.value })}
                className="rounded-sm border border-border px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Judul"
                value={manual.title}
                onChange={(e) => setManual({ ...manual, title: e.target.value })}
                className="rounded-sm border border-border px-3 py-2 text-sm"
              />
              <input
                placeholder="Penulis"
                value={manual.author}
                onChange={(e) => setManual({ ...manual, author: e.target.value })}
                className="rounded-sm border border-border px-3 py-2 text-sm"
              />
              <select
                value={manual.format}
                onChange={(e) => setManual({ ...manual, format: e.target.value as BookFormat })}
                className="rounded-sm border border-border px-3 py-2 text-sm"
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {BOOK_FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min={0}
                placeholder="Harga (Rp)"
                value={manual.price_idr}
                onChange={(e) => setManual({ ...manual, price_idr: e.target.value })}
                className="rounded-sm border border-border px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                placeholder="Stok (kosong = PO tanpa batas)"
                value={manual.stock}
                onChange={(e) => setManual({ ...manual, stock: e.target.value })}
                className="rounded-sm border border-border px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <span className="text-xs font-semibold text-ink">Sampul (opsional)</span>
              <label className="cursor-pointer text-xs font-semibold text-link hover:underline">
                {coverFile ? "Ganti file" : "Pilih file"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={savingManual}
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    setCoverFile(f);
                  }}
                />
              </label>
              {coverFile ? (
                <>
                  <span className="max-w-[16rem] truncate text-xs text-ink-muted">{coverFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setCoverFile(null)}
                    className="text-xs font-semibold text-danger hover:underline"
                  >
                    Hapus pilihan
                  </button>
                </>
              ) : (
                <span className="text-xs text-ink-faint">
                  Kalau dikosongkan, sampulnya dibuatkan otomatis dan bisa diganti kapan saja lewat tabel.
                </span>
              )}
            </div>

            {manualError && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {manualError}
              </p>
            )}
            {manualOk && (
              <p role="status" className="mt-2 text-sm font-medium text-success">
                ✓ {manualOk}
              </p>
            )}
            <button
              type="submit"
              disabled={savingManual}
              className="btn btn-primary press mt-3 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {savingManual ? "Menyimpan…" : "Tambah ke Katalog"}
            </button>
          </form>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul, penulis, ISBN"
            className="mt-6 w-72 rounded-sm border border-border px-3 py-2 text-sm"
          />

          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-ink bg-surface-sunken text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Sampul</th>
                  <SortTh label="Judul" sortKey="title" sort={sort} onSort={onSort} />
                  <SortTh label="Penulis" sortKey="author" sort={sort} onSort={onSort} />
                  <SortTh label="Format" sortKey="format" sort={sort} onSort={onSort} />
                  <SortTh label="Harga" sortKey="price" sort={sort} onSort={onSort} align="right" />
                  <SortTh label="Stok" sortKey="stock" sort={sort} onSort={onSort} align="right" />
                  <th className="px-4 py-2 font-medium">Aktif</th>
                  <SortTh label="Ditambahkan" sortKey="created" sort={sort} onSort={onSort} />
                  <th className="px-4 py-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) =>
                  editing === item.id ? (
                    <EditRow key={item.id} item={item} colSpan={9} onSave={saveRow} onCancel={() => setEditing(null)} />
                  ) : (
                    <tr key={item.id} className="border-t-1 border-line">
                      <td className="px-4 py-2">
                        <CoverCell book={item.books} onChanged={() => loadItems(eventId)} />
                      </td>
                      <td className="px-4 py-2 font-medium text-ink">{item.books.title}</td>
                      <td className="px-4 py-2 text-ink-muted">{item.books.author ?? "—"}</td>
                      <td className="px-4 py-2 text-ink-muted">{BOOK_FORMAT_LABEL[item.books.format]}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">{formatIDR(item.price_idr)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink">{item.stock ?? "∞"}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => toggleActive(item)}
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            item.is_active ? "bg-success-soft text-success" : "bg-surface-sunken text-ink-muted"
                          }`}
                        >
                          {item.is_active ? "Aktif" : "Nonaktif"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-ink-muted">
                        {formatDateID(item.books.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <button
                          onClick={() => {
                            setRowError(null);
                            setEditing(item.id);
                          }}
                          className="text-sm font-semibold text-link hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeRow(item)}
                          className="ml-3 text-sm font-semibold text-danger hover:underline"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ),
                )}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-ink-faint">
                      {items.length === 0 ? "Belum ada buku di event ini." : `Tidak ada buku yang cocok dengan "${search}".`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rowError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {rowError}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Baris katalog dalam mode edit. Melebar ke seluruh tabel (pola yang sama dipakai
// form event) supaya enam kolom tidak bikin tabel makin panjang ke samping.
// Judul/penulis/ISBN/format milik tabel `books` yang dipakai lintas batch —
// diberitahukan di form, bukan disembunyikan.
function EditRow({
  item,
  colSpan,
  onSave,
  onCancel,
}: {
  item: EventItemWithBook;
  colSpan: number;
  onSave: (item: EventItemWithBook, book: BookFields, price: number, stock: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const b = item.books;
  const [title, setTitle] = useState(b.title);
  const [author, setAuthor] = useState(b.author ?? "");
  const [isbn, setIsbn] = useState(b.isbn ?? "");
  const [format, setFormat] = useState<BookFormat>(b.format);
  const [price, setPrice] = useState(String(item.price_idr));
  const [stock, setStock] = useState(item.stock === null ? "" : String(item.stock));
  const [saving, setSaving] = useState(false);

  const priceNum = Number(price);
  const stockNum = stock.trim() === "" ? null : Number(stock);
  const valid =
    title.trim() !== "" &&
    Number.isInteger(priceNum) &&
    priceNum >= 0 &&
    (stockNum === null || (Number.isInteger(stockNum) && stockNum >= 0));

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onSave(
      item,
      // ISBN kosong harus jadi null, bukan "": index unik-nya partial (where isbn
      // is not null), jadi dua buku ber-ISBN "" akan bentrok.
      { title: title.trim(), author: author.trim() || null, isbn: isbn.trim() || null, format },
      priceNum,
      stockNum,
    );
    setSaving(false);
  }

  return (
    <tr className="border-t-1 border-line bg-primary-soft">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="flex items-start gap-4">
          <div className="w-28 shrink-0">
            <CoverCell book={b} onChanged={onCancel} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Judul">
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} className={EDIT_INPUT} />
              </Field>
              <Field label="Penulis">
                <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={150} className={EDIT_INPUT} />
              </Field>
              <Field label="ISBN">
                <input
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  maxLength={20}
                  placeholder="kosongkan kalau tidak ada"
                  className={`${EDIT_INPUT} tabular-nums`}
                />
              </Field>
              <Field label="Format">
                <select value={format} onChange={(e) => setFormat(e.target.value as BookFormat)} className={EDIT_INPUT}>
                  {FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {BOOK_FORMAT_LABEL[f]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Harga (Rp)">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={`${EDIT_INPUT} tabular-nums`}
                />
              </Field>
              <Field label="Stok" hint="kosong = tanpa batas">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                  placeholder="∞"
                  className={`${EDIT_INPUT} tabular-nums`}
                />
              </Field>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Judul, penulis, ISBN, dan format milik daftar buku — ikut berubah di semua batch yang memakai buku ini.
              Harga dan stok hanya untuk batch ini.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={submit}
                disabled={!valid || saving}
                className="btn btn-primary press px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
              >
                {saving ? "Menyimpan…" : "Simpan"}
              </button>
              <button onClick={onCancel} className="text-sm font-semibold text-ink-muted hover:underline">
                Batal
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

const EDIT_INPUT = "w-full rounded-md border border-border px-2 py-1.5 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-ink">
      {label}
      {hint && <span className="ml-1 font-normal text-ink-faint">({hint})</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

// Unggah sampul ke bucket publik `book-covers` lalu simpan URL-nya di books.
// Dipakai dua tempat: tombol Ganti di tabel, dan form tambah buku manual.
// Mengembalikan pesan error, atau null kalau berhasil.
async function uploadCover(bookId: string, file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return "File harus gambar.";
  const small = await compressImage(file);
  const ext = small.type === "image/webp" ? "webp" : small.type === "image/png" ? "png" : "jpg";
  const path = `${bookId}.${ext}`;
  const up = await supabase.storage.from("book-covers").upload(path, small, { upsert: true, contentType: small.type });
  if (up.error) return up.error.message;
  // Path selalu sama per buku → tambahkan penanda versi supaya cache CDN/browser ikut berganti.
  const url = `${supabase.storage.from("book-covers").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from("books").update({ cover_url: url }).eq("id", bookId);
  return error?.message ?? null;
}

// Buku tanpa sampul tetap memakai sampul generatif (docs/04 §6).
function CoverCell({ book, onChanged }: { book: BookRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const err = await uploadCover(book.id, file);
    setBusy(false);
    if (err) return setError(err);
    onChanged();
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-10 shrink-0">
        <BookCover compact title={book.title} coverUrl={book.cover_url} />
      </div>
      <label className="cursor-pointer text-xs font-semibold text-link hover:underline">
        {busy ? "Mengunggah…" : book.cover_url ? "Ganti" : "Unggah"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(f);
          }}
        />
      </label>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
