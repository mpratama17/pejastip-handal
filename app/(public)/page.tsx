"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSiteSettings, waLink } from "@/lib/site-settings";
import { formatDateID } from "@/lib/format";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import { BookCover } from "@/components/public/book-cover";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type Bestseller = Database["public"]["Functions"]["get_bestsellers"]["Returns"][number];

const STEPS = [
  { title: "Pilih batch & buku", body: "Cek katalog batch yang sedang buka." },
  { title: "Isi form & bayar DP", body: "Kode pelacakanmu langsung tampil setelah order." },
  { title: "Pantau lewat kode", body: "Status tiap buku terlihat sampai tiba di Indonesia." },
  { title: "Lunasi & terima kiriman", body: "Isi Form Kirim, resi muncul di Lacak Order." },
];

export default function HomePage() {
  const settings = useSiteSettings();
  const [openEvents, setOpenEvents] = useState<EventRow[] | null>(null);
  const [withCatalogue, setWithCatalogue] = useState<Set<string>>(new Set());
  const [bestsellers, setBestsellers] = useState<Bestseller[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("events").select("*").eq("status", "open").order("closes_at", { ascending: true, nullsFirst: false }),
      supabase.from("event_items").select("event_id"),
    ]).then(([ev, items]) => {
      // Gagal muat ≠ "belum ada batch": jangan tampilkan pesan yang menyesatkan.
      if (ev.error || items.error) return setLoadFailed(true);
      const ids = new Set((items.data ?? []).map((i) => i.event_id));
      // Hero mengutamakan batch yang bisa langsung dipesan lewat form.
      const list = [...(ev.data ?? [])].sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)));
      setWithCatalogue(ids);
      setOpenEvents(list);
    });
    supabase.rpc("get_bestsellers", { p_limit: 12 }).then(({ data }) => setBestsellers(data ?? []));
  }, []);

  const featured = openEvents?.[0];
  const featuredHasCatalogue = featured ? withCatalogue.has(featured.id) : false;
  const otherOpen = (openEvents?.length ?? 0) - 1;

  return (
    <>
      <section className="bg-jacket text-bg">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-10 px-4 pb-14 pt-12 sm:pt-16">
          <div className="min-w-0">
          <p className="max-w-md text-sm text-bg/70">{settings?.store_tagline}</p>

          {loadFailed ? (
            <p className="mt-8 max-w-md text-sm text-bg/80" role="alert">
              Info batch gagal dimuat. Periksa koneksi lalu muat ulang halaman, atau{" "}
              <Link href="/ongoing" className="underline underline-offset-4">
                buka Batch Berjalan
              </Link>
              .
            </p>
          ) : openEvents === null ? (
            <div className="mt-6 h-24 max-w-lg animate-pulse rounded-md bg-bg/10" />
          ) : featured ? (
            <>
              <p className="mt-8 text-sm text-[#b9d3c8]">
                Batch dibuka{featured.closes_at ? ` · tutup ${formatDateID(featured.closes_at)}` : ""}
              </p>
              <h1 className="mt-2 max-w-2xl font-display text-4xl font-medium italic leading-tight [text-wrap:balance] sm:text-5xl">
                {featured.name}
              </h1>
              <p className="mt-3 text-sm text-bg/75">
                {EVENT_TYPE_LABEL[featured.type]} · DP {Number(featured.dp_percent)}%
                {featured.eta_note ? ` · ${featured.eta_note}` : ""}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {featuredHasCatalogue ? (
                  <Link
                    href={`/catalogue?event=${featured.id}`}
                    className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Lihat Katalog
                  </Link>
                ) : (
                  settings?.wa_admin_number && (
                    <a
                      href={waLink(settings.wa_admin_number, `Halo Admin, saya mau order untuk ${featured.name}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white hover:brightness-110"
                    >
                      Order via WhatsApp
                    </a>
                  )
                )}
                <Link
                  href="/how-to-order"
                  className="rounded-md border border-bg/40 px-5 py-3 text-sm font-semibold text-bg hover:bg-bg/10"
                >
                  Cara Order
                </Link>
              </div>
              {otherOpen > 0 && (
                <Link href="/ongoing" className="mt-5 inline-block text-sm text-bg/75 underline underline-offset-4 hover:text-bg">
                  +{otherOpen} batch lain sedang buka
                </Link>
              )}
            </>
          ) : (
            <>
              <h1 className="mt-8 max-w-2xl font-display text-4xl font-medium italic leading-tight [text-wrap:balance] sm:text-5xl">
                Belum ada batch yang buka
              </h1>
              <p className="mt-3 max-w-md text-sm text-bg/75">
                Pantau jadwal batch berikutnya, atau titip cari buku lewat Request Buku.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/ongoing" className="rounded-md bg-accent px-5 py-3 text-sm font-semibold text-white hover:brightness-110">
                  Lihat Batch Berjalan
                </Link>
                <Link href="/request" className="rounded-md border border-bg/40 px-5 py-3 text-sm font-semibold text-bg hover:bg-bg/10">
                  Request Buku
                </Link>
              </div>
            </>
          )}
          </div>

          {bestsellers.length >= 3 && (
            <div aria-hidden="true" className="relative hidden h-64 w-56 shrink-0 md:block">
              {bestsellers.slice(0, 3).map((b, i) => (
                <div
                  key={b.book_id}
                  className="absolute top-0 w-36 shadow-xl"
                  style={{ left: `${i * 34}px`, transform: `rotate(${(i - 1) * 7}deg) translateY(${i === 1 ? -6 : 10}px)`, zIndex: i === 1 ? 2 : 1 }}
                >
                  <BookCover title={b.title} author={b.author} coverUrl={b.cover_url} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {bestsellers.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-semibold">Buku terlaris</h2>
            <Link href="/catalogue" className="text-sm font-medium text-primary hover:underline">
              Lihat katalog
            </Link>
          </div>
          <div className="-mx-4 mt-5 flex snap-x gap-4 overflow-x-auto px-4 pb-3">
            {bestsellers.map((b) => (
              <div key={b.book_id} className="w-28 shrink-0 snap-start sm:w-32">
                <BookCover title={b.title} author={b.author} coverUrl={b.cover_url} />
                <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{b.title}</p>
                {b.author && <p className="text-xs text-ink-muted">{b.author}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-4 pt-12">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickCard href="/how-to-order" title="Cara Order" body="Panduan pesan lewat web atau WhatsApp" />
          <QuickCard href="/track" title="Lacak Order" body="Cek status pesananmu dengan kode" />
          <QuickCard href="/ongoing" title="Batch Berjalan" body="Semua batch aktif & perkiraan tiba" />
          {settings?.wa_group_link ? (
            <QuickCard href={settings.wa_group_link} external title="Grup WhatsApp" body="Info batch baru & diskusi buku" />
          ) : (
            <QuickCard href="/request" title="Request Buku" body="Titip cari buku di luar katalog" />
          )}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pt-14">
        <h2 className="font-display text-2xl font-semibold">Cara kerjanya</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function QuickCard({ href, title, body, external }: { href: string; title: string; body: string; external?: boolean }) {
  const cls =
    "flex h-full flex-col rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary";
  const content = (
    <>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-muted">{body}</p>
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {content}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}
