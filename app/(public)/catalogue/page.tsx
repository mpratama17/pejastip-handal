"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import { BOOK_FORMAT_LABEL, isAcceptingOrders } from "@/lib/labels";
import { StatusChip } from "@/components/status-chip";
import { TypeChip } from "@/components/type-chip";
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
      [r.title, r.author, r.publisher, r.isbn].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="rounded-lg border border-border bg-surface p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold">Katalog buku</h1>
            {event && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <StatusChip kind="event" status={event.status} />
                <TypeChip type={event.type} />
                DP {Number(event.dp_percent)}%
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
              className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-ink"
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
          <label className="relative w-full sm:max-w-sm">
            <span className="sr-only">Cari buku</span>
            <SearchIcon />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cari judul, penulis, atau ISBN"
              className="w-full rounded-full border border-border py-2.5 pl-10 pr-4 text-sm"
            />
          </label>
          {event && isAcceptingOrders(event, now) && (
            <Link
              href={`/order?event=${event.id}`}
              className="btn btn-primary press px-4 py-2.5 text-center text-sm font-semibold"
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
            <div className="mt-6 hidden overflow-x-auto rounded-md border border-ink md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-ink bg-surface-sunken text-left">
                  <tr>
                    <th className="py-2.5 pl-3 pr-4 font-semibold">ISBN</th>
                    <th className="py-2.5 pr-4 font-semibold">Judul</th>
                    <th className="py-2.5 pr-4 font-semibold">Penulis</th>
                    <th className="py-2.5 pr-4 font-semibold">Publisher</th>
                    <th className="py-2.5 pr-4 font-semibold">Format</th>
                    <th className="py-2.5 pr-4 text-right font-semibold">Stok</th>
                    <th className="py-2.5 pr-3 text-right font-semibold">Harga</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.event_item_id} className="border-b-1 border-line last:border-0 hover:bg-primary-soft">
                      <td className="py-2.5 pl-3 pr-4 tabular-nums text-ink-muted">{r.isbn ?? "—"}</td>
                      <td className="py-2.5 pr-4 font-semibold">
                        <span className="flex items-center gap-3">
                          <span className="w-10 shrink-0">
                            <BookCover compact title={r.title} coverUrl={r.cover_url} />
                          </span>
                          {r.title}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-ink-muted">{r.author ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{r.publisher ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-ink-muted">{BOOK_FORMAT_LABEL[r.format]}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <StockLabel left={r.stock_left} />
                      </td>
                      <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-accent-ink">{formatIDR(r.price_idr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: kartu */}
            <ul className="mt-6 flex flex-col gap-3 md:hidden">
              {pageRows.map((r) => (
                <li key={r.event_item_id} className="card flex gap-3 p-3">
                  <div className="w-16 shrink-0">
                    <BookCover compact title={r.title} coverUrl={r.cover_url} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug">{r.title}</p>
                    <p className="text-xs text-ink-muted">
                      {[r.author, r.publisher, BOOK_FORMAT_LABEL[r.format]].filter(Boolean).join(" · ")}
                    </p>
                    {r.isbn && <p className="text-xs tabular-nums text-ink-faint">{r.isbn}</p>}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="font-bold tabular-nums text-accent-ink">{formatIDR(r.price_idr)}</span>
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
                    className="btn btn-secondary press px-4 py-1.5"
                  >
                    Sebelumnya
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page === pageCount}
                    className="btn btn-secondary press px-4 py-1.5"
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
        <Link href="/request" className="font-medium text-link hover:underline">
          Request buku di sini
        </Link>
      </p>
    </div>
  );
}

const chip = "inline-flex whitespace-nowrap rounded-full border-[1.5px] border-ink px-2 py-0.5 text-xs font-bold";

function StockLabel({ left }: { left: number | null }) {
  if (left === null) return <span className={`${chip} bg-sky-soft`}>Pre-order</span>;
  if (left === 0) return <span className={`${chip} bg-danger-soft text-danger`}>Habis</span>;
  return <span className={`${chip} bg-type-ready tabular-nums`}>Sisa {left}</span>;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2">
      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m13 13 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
