"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import { parseSimpleCSV } from "@/lib/csv";
import { BOOK_FORMAT_LABEL } from "@/lib/labels";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type BookFormat = Database["public"]["Enums"]["book_format"];
type EventItemWithBook = Database["public"]["Tables"]["event_items"]["Row"] & {
  books: Database["public"]["Tables"]["books"]["Row"];
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

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-ink">Katalog</h1>

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
                  <thead className="bg-surface-sunken text-left text-ink-muted">
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
              <thead className="bg-surface-sunken text-left text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Judul</th>
                  <th className="px-4 py-2 font-medium">Penulis</th>
                  <th className="px-4 py-2 font-medium">Format</th>
                  <th className="px-4 py-2 text-right font-medium">Harga</th>
                  <th className="px-4 py-2 text-right font-medium">Stok</th>
                  <th className="px-4 py-2 font-medium">Aktif</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t-1 border-line">
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
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                      Belum ada buku di event ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
