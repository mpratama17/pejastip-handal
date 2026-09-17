"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useSiteSettings, waLink } from "@/lib/site-settings";
import { formatDateID } from "@/lib/format";
import { isAcceptingOrders } from "@/lib/labels";
import { TypeChip } from "@/components/type-chip";
import { CircleBadge, DaisySticker, SquiggleArrow } from "@/components/public/stickers";
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
  const [now] = useState(Date.now);

  useEffect(() => {
    Promise.all([
      supabase.from("events").select("*").eq("status", "open").order("closes_at", { ascending: true, nullsFirst: false }),
      supabase.from("event_items").select("event_id"),
    ]).then(([ev, items]) => {
      // Gagal muat ≠ "belum ada batch": jangan tampilkan pesan yang menyesatkan.
      if (ev.error || items.error) return setLoadFailed(true);
      const ids = new Set((items.data ?? []).map((i) => i.event_id));
      // Hero mengutamakan batch yang bisa langsung dipesan lewat form.
      const list = (ev.data ?? []).filter((e) => isAcceptingOrders(e, now)).sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)));
      setWithCatalogue(ids);
      setOpenEvents(list);
    });
    supabase.rpc("get_bestsellers", { p_limit: 12 }).then(({ data }) => setBestsellers(data ?? []));
  }, [now]);

  const featured = openEvents?.[0];
  const featuredHasCatalogue = featured ? withCatalogue.has(featured.id) : false;
  const otherOpen = (openEvents?.length ?? 0) - 1;

  return (
    <>
      <section className="mx-auto w-full max-w-5xl px-4 pt-6 sm:pt-8">
        <div className="card relative grid items-center gap-8 overflow-hidden bg-sky px-5 py-8 sm:px-10 sm:py-12 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="max-w-md text-sm font-medium">{settings?.store_tagline}</p>

            {loadFailed ? (
              <p className="mt-6 max-w-md text-sm" role="alert">
                Info batch gagal dimuat. Periksa koneksi lalu muat ulang halaman, atau{" "}
                <Link href="/ongoing" className="font-semibold underline underline-offset-4">
                  buka Batch Berjalan
                </Link>
                .
              </p>
            ) : openEvents === null ? (
              <div className="mt-6 h-28 max-w-lg animate-pulse rounded-md bg-surface/50" />
            ) : featured ? (
              <>
                <div className="mt-6 flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <TypeChip type={featured.type} />
                  <span className="rounded-full border-[1.5px] border-ink bg-surface px-2.5 py-0.5 text-xs font-bold">
                    Batch dibuka{featured.closes_at ? ` · tutup ${formatDateID(featured.closes_at)}` : ""}
                  </span>
                </div>
                <h1 className="mt-4 max-w-2xl font-display text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                  {featured.name}
                </h1>
                <p className="mt-3 text-sm font-medium">
                  DP {Number(featured.dp_percent)}%{featured.eta_note ? ` · tiba ${featured.eta_note}` : ""}
                </p>
                <div className="relative mt-7 flex flex-wrap gap-3">
                  {featuredHasCatalogue ? (
                    <Link href={`/catalogue?event=${featured.id}`} className="btn btn-primary press px-5 py-3 text-sm">
                      Lihat Katalog
                    </Link>
                  ) : (
                    settings?.wa_admin_number && (
                      <a
                        href={waLink(settings.wa_admin_number, `Halo Admin, saya mau order untuk ${featured.name}.`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary press px-5 py-3 text-sm"
                      >
                        Order via WhatsApp
                      </a>
                    )
                  )}
                  <Link href="/how-to-order" className="btn btn-secondary press px-5 py-3 text-sm">
                    Cara Order
                  </Link>
                  <SquiggleArrow className="pointer-events-none absolute left-[19.5rem] top-1 hidden w-32 lg:block" />
                </div>
                {otherOpen > 0 && (
                  <Link href="/ongoing" className="mt-5 inline-block text-sm font-semibold underline underline-offset-4">
                    +{otherOpen} batch lain sedang buka
                  </Link>
                )}
              </>
            ) : (
              <>
                <h1 className="mt-6 max-w-2xl font-display text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                  Belum ada batch yang buka
                </h1>
                <p className="mt-3 max-w-md text-sm font-medium">
                  Pantau jadwal batch berikutnya, atau titip cari buku lewat Request Buku.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/ongoing" className="btn btn-primary press px-5 py-3 text-sm">
                    Lihat Batch Berjalan
                  </Link>
                  <Link href="/request" className="btn btn-secondary press px-5 py-3 text-sm">
                    Request Buku
                  </Link>
                </div>
              </>
            )}
          </div>

          {bestsellers.length >= 3 && (
            // Pengganti foto di R1: tumpukan sampul di atas kartu kuning (docs/04 §6).
            <div aria-hidden="true" className="relative mx-auto hidden h-72 w-64 md:block">
              <div className="absolute inset-x-0 bottom-4 top-6 rounded-lg border-[length:var(--bw)] border-ink bg-primary shadow-hard" />
              {bestsellers.slice(0, 3).map((b, i) => (
                <div
                  key={b.book_id}
                  className="absolute top-14 w-24"
                  style={{ left: `${22 + i * 62}px`, transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -10 : 6}px)`, zIndex: i === 1 ? 2 : 1 }}
                >
                  <BookCover title={b.title} author={b.author} coverUrl={b.cover_url} />
                </div>
              ))}
              <CircleBadge text="JASTIP BUKU IMPOR • BATCH BARU • " className="absolute -bottom-2 -right-4 z-10 w-24 motion-safe:animate-[spin_24s_linear_infinite]" />
              <DaisySticker className="absolute -left-6 top-0 z-10 w-14" />
            </div>
          )}
        </div>
      </section>

      {bestsellers.length > 0 && (
        <section className="mx-auto w-full max-w-5xl px-4 pt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-2xl font-bold">Buku terlaris</h2>
            <Link href="/catalogue" className="text-sm font-semibold text-link hover:underline">
              Lihat katalog
            </Link>
          </div>
          <div className="-mx-4 mt-5 flex snap-x gap-4 overflow-x-auto px-4 pb-3">
            {bestsellers.map((b) => (
              <div key={b.book_id} className="w-28 shrink-0 snap-start sm:w-32">
                <BookCover title={b.title} author={b.author} coverUrl={b.cover_url} />
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{b.title}</p>
                {b.author && <p className="text-xs text-ink-muted">{b.author}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto w-full max-w-5xl px-4 pt-12">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <QuickCard href="/how-to-order" title="Cara Order" body="Panduan pesan lewat web atau WhatsApp" stripe="bg-type-ready" />
          <QuickCard href="/track" title="Lacak Order" body="Cek status pesananmu dengan kode" stripe="bg-type-us" />
          <QuickCard href="/ongoing" title="Batch Berjalan" body="Semua batch aktif & perkiraan tiba" stripe="bg-type-special" />
          {settings?.wa_group_link ? (
            <QuickCard href={settings.wa_group_link} external title="Grup WhatsApp" body="Info batch baru & diskusi buku" stripe="bg-type-uk" />
          ) : (
            <QuickCard href="/request" title="Request Buku" body="Titip cari buku di luar katalog" stripe="bg-type-uk" />
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pt-14">
        <h2 className="font-display text-2xl font-bold">Cara kerjanya</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[length:var(--bw)] border-ink bg-primary font-display text-base font-extrabold">
                {i + 1}
              </span>
              <div>
                <p className="font-bold">{s.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function QuickCard({
  href,
  title,
  body,
  stripe,
  external,
}: {
  href: string;
  title: string;
  body: string;
  stripe: string;
  external?: boolean;
}) {
  const cls = "card press flex h-full flex-col overflow-hidden";
  const content = (
    <>
      <span className={`h-3 border-b-[length:var(--bw)] border-ink ${stripe}`} />
      <span className="flex flex-1 flex-col p-4">
        <span className="font-display text-lg font-bold">{title}</span>
        <span className="mt-1 text-sm text-ink-muted">{body}</span>
      </span>
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
