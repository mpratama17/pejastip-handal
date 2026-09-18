"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import { parseSimpleCSV } from "@/lib/csv";
import { BOOK_FORMAT_LABEL } from "@/lib/labels";
import { compressImage } from "@/lib/compress-image";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { BookCover } from "@/components/public/book-cover";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type BookFormat = Database["public"]["Enums"]["book_format"];
type BookRow = Database["public"]["Tables"]["books"]["Row"];
type EventItemWithBook = Database["public"]["Tables"]["event_items"]["Row"] & {
  books: BookRow;
};
type ImportResult = Database["public"]["Functions"]["import_catalog_csv"]["Returns"][number];

const FORMATS: BookFormat[] = ["paperback", "hardcover", "boxset", "other"];

export default function AdminBooksPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [items, setItems] = useState<EventItemWithBook[]>([]);
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
  const [savingManual, setSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

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
    setSavingManual(true);
    setManualError(null);

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

    setSavingManual(false);
    if (error) {
      setManualError(error.message);
      return;
    }
    const result = rows?.[0];
    if (result?.status === "error") {
      setManualError(result.message ?? "Gagal menyimpan.");
      return;
    }
    setManual({ isbn: "", title: "", author: "", format: "paperback", price_idr: "", stock: "" });
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
  async function saveRow(item: EventItemWithBook, price: number, stock: number | null) {
    setRowError(null);
    const { error } = await supabase
      .from("event_items")
      .update({ price_idr: price, stock })
      .eq("id", item.id);
    if (error) return setRowError(`Gagal simpan ${item.books.title}: ${error.message}`);
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

          <form onSubmit={handleManualAdd} className="mt-6 rounded-lg border border-border bg-surface p-5">
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
            {manualError && <p className="mt-2 text-sm text-danger">{manualError}</p>}
            <button
              type="submit"
              disabled={savingManual}
              className="btn btn-primary press mt-3 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {savingManual ? "Menyimpan…" : "Tambah ke Katalog"}
            </button>
          </form>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-ink bg-surface-sunken text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Sampul</th>
                  <th className="px-4 py-2 font-medium">Judul</th>
                  <th className="px-4 py-2 font-medium">Penulis</th>
                  <th className="px-4 py-2 font-medium">Format</th>
                  <th className="px-4 py-2 text-right font-medium">Harga</th>
                  <th className="px-4 py-2 text-right font-medium">Stok</th>
                  <th className="px-4 py-2 font-medium">Aktif</th>
                  <th className="px-4 py-2 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) =>
                  editing === item.id ? (
                    <EditRow key={item.id} item={item} onSave={saveRow} onCancel={() => setEditing(null)} />
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
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-ink-faint">
                      Belum ada buku di event ini.
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

// Baris katalog dalam mode edit: harga & stok saja. Judul/penulis milik tabel
// `books` (dipakai lintas batch), jadi tidak diubah dari sini.
function EditRow({
  item,
  onSave,
  onCancel,
}: {
  item: EventItemWithBook;
  onSave: (item: EventItemWithBook, price: number, stock: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState(String(item.price_idr));
  const [stock, setStock] = useState(item.stock === null ? "" : String(item.stock));
  const [saving, setSaving] = useState(false);
  const priceNum = Number(price);
  const stockNum = stock.trim() === "" ? null : Number(stock);
  const valid =
    Number.isInteger(priceNum) && priceNum >= 0 && (stockNum === null || (Number.isInteger(stockNum) && stockNum >= 0));

  async function submit() {
    if (!valid) return;
    setSaving(true);
    await onSave(item, priceNum, stockNum);
    setSaving(false);
  }

  return (
    <tr className="border-t-1 border-line bg-primary-soft">
      <td className="px-4 py-2">
        <CoverCell book={item.books} onChanged={onCancel} />
      </td>
      <td className="px-4 py-2 font-medium text-ink">{item.books.title}</td>
      <td className="px-4 py-2 text-ink-muted">{item.books.author ?? "—"}</td>
      <td className="px-4 py-2 text-ink-muted">{BOOK_FORMAT_LABEL[item.books.format]}</td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          min={0}
          step={1}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          aria-label={`Harga ${item.books.title}`}
          className="w-28 rounded-md border border-border px-2 py-1 text-right tabular-nums"
        />
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          min={0}
          step={1}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="∞"
          aria-label={`Stok ${item.books.title}`}
          className="w-20 rounded-md border border-border px-2 py-1 text-right tabular-nums"
        />
      </td>
      <td className="px-4 py-2 text-xs text-ink-muted">Kosong = tanpa batas</td>
      <td className="whitespace-nowrap px-4 py-2 text-right">
        <button
          onClick={submit}
          disabled={!valid || saving}
          className="btn btn-primary press px-3 py-1 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        <button onClick={onCancel} className="ml-3 text-sm font-semibold text-ink-muted hover:underline">
          Batal
        </button>
      </td>
    </tr>
  );
}

// Unggah sampul ke bucket publik `book-covers` lalu simpan URL-nya di books.
// Buku tanpa sampul tetap memakai sampul generatif (docs/04 §6).
function CoverCell({ book, onChanged }: { book: BookRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) return setError("File harus gambar.");
    setBusy(true);
    setError(null);
    const small = await compressImage(file);
    const ext = small.type === "image/webp" ? "webp" : small.type === "image/png" ? "png" : "jpg";
    const path = `${book.id}.${ext}`;
    const up = await supabase.storage.from("book-covers").upload(path, small, { upsert: true, contentType: small.type });
    if (up.error) {
      setBusy(false);
      return setError(up.error.message);
    }
    // Path selalu sama per buku → tambahkan penanda versi supaya cache CDN/browser ikut berganti.
    const url = `${supabase.storage.from("book-covers").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const { error } = await supabase.from("books").update({ cover_url: url }).eq("id", book.id);
    setBusy(false);
    if (error) return setError(error.message);
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
