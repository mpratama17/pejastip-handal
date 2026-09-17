"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import { BOOK_FORMAT_LABEL, EVENT_TYPE_LABEL, isAcceptingOrders } from "@/lib/labels";
import { StatusChip } from "@/components/status-chip";
import { BookCover } from "@/components/public/book-cover";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type CatalogueRow = Database["public"]["Functions"]["get_catalogue"]["Returns"][number];

const PAGE_SIZE = 20;
const CATALOGUE_STATUSES = ["open", "closed", "ordered", "shipped_to_indo", "arrived"] as const;

export default function CataloguePage() {
  return (
    <Suspense fallback={null}>
      <Catalogue />
    </Suspense>
  );
}

function Catalogue() {
  const router = useRouter();
  const params = useSearchParams();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [rows, setRows] = useState<CatalogueRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [now] = useState(Date.now);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("events").select("*").in("status", [...CATALOGUE_STATUSES]).order("created_at", { ascending: false }),
      supabase.from("event_items").select("event_id"),
    ]).then(([ev, items]) => {
      if (ev.error || items.error) return setLoadError(true);
      const withItems = new Set((items.data ?? []).map((i) => i.event_id));
      const list = (ev.data ?? []).filter((e) => withItems.has(e.id));
      // Batch yang masih buka tampil duluan.
      list.sort((a, b) => Number(isAcceptingOrders(b, now)) - Number(isAcceptingOrders(a, now)));
      setEvents(list);
    });
  }, [now]);

  const eventId = params.get("event") ?? events?.[0]?.id ?? "";
  const event = events?.find((e) => e.id === eventId);

  useEffect(() => {
    if (!eventId) return;
    let stale = false;
    setRows(null);
    setPage(1);
    supabase.rpc("get_catalogue", { p_event_id: eventId }).then(({ data, error }) => {
      if (stale) return;
      if (error) return setLoadError(true);
      setRows(data ?? []);
    });
    return () => {
      stale = true;
    };
  }, [eventId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows || !q) return rows ?? [];
    return rows.filter((r) =>
      [r.title, r.author, r.isbn].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-lg border border-border bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold">Katalog buku</h1>
            {event && (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <StatusChip kind="event" status={event.status} />
                {EVENT_TYPE_LABEL[event.type]} · DP {Number(event.dp_percent)}%
                {event.eta_note ? ` · ${event.eta_note}` : ""}
              </p>
            )}
          </div>
          <label className="sm:w-72">
            <span className="sr-only">Pilih batch</span>
            <select
              value={eventId}
              onChange={(e) => router.replace(`/catalogue?event=${e.target.value}`, { scroll: false })}
              disabled={!events?.length}
              className="w-full rounded-md border border-border bg-primary-soft px-3 py-2.5 text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {events?.length === 0 && <option>Belum ada batch dengan katalog</option>}
              {events?.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                  {isAcceptingOrders(ev, now) ? "" : " (ditutup)"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari judul, penulis, atau ISBN"
            className="w-full rounded-md border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-sm"
          />
          {event && isAcceptingOrders(event, now) && (
            <Link
              href={`/order?event=${event.id}`}
              className="rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Order dari batch ini
            </Link>
          )}
        </div>

        {loadError ? (
          <p className="py-16 text-center text-sm text-danger" role="alert">
            Katalog gagal dimuat. Periksa koneksi lalu muat ulang halaman.
          </p>
        ) : rows === null ? (
          <p className="py-16 text-center text-sm text-ink-muted">{events?.length === 0 ? "Belum ada batch dengan katalog." : "Memuat katalog…"}</p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            {search ? `Tidak ada buku yang cocok dengan "${search}".` : "Katalog batch ini masih kosong."}
          </p>
        ) : (
          <>
            {/* Desktop: tabel */}
            <div className="mt-6 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-ink-muted">
                  <tr>
                    <th className="py-2 pr-4 font-medium">ISBN</th>
                    <th className="py-2 pr-4 font-medium">Judul</th>
                    <th className="py-2 pr-4 font-medium">Penulis</th>
                    <th className="py-2 pr-4 font-medium">Format</th>
                    <th className="py-2 pr-4 text-right font-medium">Stok</th>
                    <th className="py-2 text-right font-medium">Harga</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.event_item_id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4 tabular-nums text-ink-muted">{r.isbn ?? "—"}</td>
                      <td className="py-3 pr-4 font-medium">{r.title}</td>
                      <td className="py-3 pr-4 text-ink-muted">{r.author ?? "—"}</td>
                      <td className="py-3 pr-4 text-ink-muted">{BOOK_FORMAT_LABEL[r.format]}</td>
                      <td className="py-3 pr-4 text-right">
                        <StockLabel left={r.stock_left} />
                      </td>
                      <td className="py-3 text-right font-semibold tabular-nums text-accent">{formatIDR(r.price_idr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: kartu */}
            <ul className="mt-6 flex flex-col gap-3 md:hidden">
              {pageRows.map((r) => (
                <li key={r.event_item_id} className="flex gap-3 border-b border-border/60 pb-3 last:border-0">
                  <div className="w-16 shrink-0">
                    <BookCover compact title={r.title} coverUrl={r.cover_url} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-snug">{r.title}</p>
                    <p className="text-xs text-ink-muted">
                      {[r.author, BOOK_FORMAT_LABEL[r.format]].filter(Boolean).join(" · ")}
                    </p>
                    {r.isbn && <p className="text-xs tabular-nums text-ink-faint">{r.isbn}</p>}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="font-semibold tabular-nums text-accent">{formatIDR(r.price_idr)}</span>
                      <StockLabel left={r.stock_left} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-center justify-between text-sm text-ink-muted">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} buku
              </span>
              {pageCount > 1 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => p - 1)}
                    disabled={page === 1}
                    className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Sebelumnya
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page === pageCount}
                    className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Tidak menemukan buku yang kamu cari?{" "}
        <Link href="/request" className="font-medium text-primary hover:underline">
          Request buku di sini
        </Link>
      </p>
    </div>
  );
}

function StockLabel({ left }: { left: number | null }) {
  if (left === null) return <span className="text-xs text-ink-muted">Pre-order</span>;
  if (left === 0) return <span className="text-xs font-semibold text-danger">Habis</span>;
  return <span className="text-xs tabular-nums text-ink-muted">Sisa {left}</span>;
}
