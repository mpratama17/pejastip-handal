"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatDateID } from "@/lib/format";
import { useSiteSettings, waLink } from "@/lib/site-settings";
import { EVENT_TYPE_LABEL, isAcceptingOrders, isBeforeOpen, isPastClose } from "@/lib/labels";
import { StatusChip } from "@/components/status-chip";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

// Urutan tampil: yang masih bisa dipesan dulu, lalu yang paling dekat tiba.
const STATUS_ORDER = ["open", "arrived", "shipped_to_indo", "ordered", "closed"] as const;

export default function OngoingPage() {
  const settings = useSiteSettings();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [withCatalogue, setWithCatalogue] = useState<Set<string>>(new Set());
  const [loadFailed, setLoadFailed] = useState(false);
  const [now] = useState(Date.now);

  useEffect(() => {
    supabase
      .from("event_items")
      .select("event_id")
      .then(({ data }) => setWithCatalogue(new Set((data ?? []).map((i) => i.event_id))));
    supabase
      .from("events")
      .select("*")
      .in("status", [...STATUS_ORDER])
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) return setLoadFailed(true);
        const list = data ?? [];
        list.sort(
          (a, b) =>
            STATUS_ORDER.indexOf(a.status as (typeof STATUS_ORDER)[number]) -
            STATUS_ORDER.indexOf(b.status as (typeof STATUS_ORDER)[number]),
        );
        setEvents(list);
      });
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Batch berjalan</h1>
          <p className="mt-1 text-sm text-ink-muted">Status dan perkiraan tiba setiap batch yang sedang diproses.</p>
        </div>
        <Link
          href="/track"
          className="rounded-md border border-primary px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          Lacak order pribadi
        </Link>
      </div>

      {loadFailed ? (
        <p className="mt-10 rounded-lg border border-danger/30 bg-danger-soft p-6 text-center text-sm text-danger" role="alert">
          Daftar batch gagal dimuat. Periksa koneksi lalu muat ulang halaman.
        </p>
      ) : events === null ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="mt-10 rounded-lg border border-border bg-surface p-8 text-center text-sm text-ink-muted">
          Belum ada batch yang berjalan. Info batch baru diumumkan di grup WhatsApp.
        </p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {events.map((ev) => {
            const accepting = isAcceptingOrders(ev, now);
            // "Buka" yang sudah lewat tanggal tutup tampil sebagai Ditutup.
            const pastClose = isPastClose(ev, now);
            const beforeOpen = isBeforeOpen(ev, now);
            return (
              <li key={ev.id} className="flex flex-col rounded-lg border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-ink-faint">{EVENT_TYPE_LABEL[ev.type]}</p>
                    <h2 className="mt-0.5 font-display text-xl font-semibold leading-snug">{ev.name}</h2>
                  </div>
                  <StatusChip kind="event" status={pastClose ? "closed" : ev.status} />
                </div>

                {ev.description && <p className="mt-3 whitespace-pre-line text-sm text-ink-muted">{ev.description}</p>}

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-ink-faint">Perkiraan tiba</dt>
                    <dd className="font-medium">{ev.eta_note || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-faint">{beforeOpen ? "Dibuka" : accepting ? "Ditutup" : "DP"}</dt>
                    <dd className="font-medium">
                      {beforeOpen && ev.opens_at
                        ? formatDateID(ev.opens_at, true)
                        : accepting
                          ? ev.closes_at
                            ? formatDateID(ev.closes_at, true)
                            : "Sampai kuota penuh"
                          : `${Number(ev.dp_percent)}%`}
                    </dd>
                  </div>
                </dl>

                {accepting && (
                  <div className="mt-4 flex gap-4 border-t border-border pt-4 text-sm font-medium">
                    {withCatalogue.has(ev.id) ? (
                      <>
                        <Link href={`/catalogue?event=${ev.id}`} className="text-primary hover:underline">
                          Lihat katalog
                        </Link>
                        <Link href={`/order?event=${ev.id}`} className="text-primary hover:underline">
                          Order
                        </Link>
                      </>
                    ) : (
                      settings?.wa_admin_number && (
                        // Batch tanpa katalog dipesan lewat chat (docs/02 §Event tanpa katalog).
                        <a
                          href={waLink(settings.wa_admin_number, `Halo Admin, saya mau order untuk ${ev.name}.`)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Order via WhatsApp
                        </a>
                      )
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
