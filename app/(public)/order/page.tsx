"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { BOOK_FORMAT_LABEL, isAcceptingOrders } from "@/lib/labels";
import { TypeChip } from "@/components/type-chip";
import { waLink, type BankAccount } from "@/lib/site-settings";
import { BookCover } from "@/components/public/book-cover";
import { DaisySticker, StarSticker } from "@/components/public/stickers";
import { PaymentProofUpload } from "@/components/public/payment-proof-upload";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type CatalogueRow = Database["public"]["Functions"]["get_catalogue"]["Returns"][number];
type OrderResult = Database["public"]["Functions"]["create_order"]["Returns"][number];

// Satu halaman, bukan wizard (docs/02 §Form order: "lima langkah dalam satu
// halaman"). Nomor 1-5 cuma label bagian, tidak menggerbangi apa pun — semua
// terlihat sekaligus, dan ringkasan "Slip Order" menempel di kanan.
const INPUT =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink";

export default function OrderPage() {
  return (
    <Suspense fallback={null}>
      <OrderForm />
    </Suspense>
  );
}

function OrderForm() {
  const presetEvent = useSearchParams().get("event");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [catalogue, setCatalogue] = useState<CatalogueRow[] | null>(null);
  const [search, setSearch] = useState("");

  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [eventId, setEventId] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentType, setPaymentType] = useState<"dp" | "full">("dp");
  const [customerNotes, setCustomerNotes] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [now] = useState(Date.now);
  const [result, setResult] = useState<OrderResult | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("events").select("*").eq("status", "open").order("closes_at", { ascending: true, nullsFirst: false }),
      supabase.from("event_items").select("event_id"),
    ]).then(([ev, items]) => {
      if (ev.error || items.error) return setLoadError(true);
      // Batch tanpa katalog dipesan lewat WhatsApp, bukan form (docs/02).
      const withItems = new Set((items.data ?? []).map((i) => i.event_id));
      const list = (ev.data ?? []).filter((e) => withItems.has(e.id) && isAcceptingOrders(e, now));
      setEvents(list);
      if (presetEvent && list.some((e) => e.id === presetEvent)) setEventId(presetEvent);
      else if (list.length === 1) setEventId(list[0].id);
    });
  }, [presetEvent, now]);

  useEffect(() => {
    if (!eventId) return;
    // Abaikan respons batch sebelumnya kalau customer sudah ganti batch.
    let stale = false;
    setCatalogue(null);
    supabase.rpc("get_catalogue", { p_event_id: eventId }).then(({ data, error }) => {
      if (stale) return;
      if (error) return setLoadError(true);
      setCatalogue(data ?? []);
    });
    return () => {
      stale = true;
    };
  }, [eventId]);

  const selectedEvent = events?.find((e) => e.id === eventId);
  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!catalogue || !q) return [];
    return catalogue.filter((r) => [r.title, r.author, r.isbn].some((v) => v?.toLowerCase().includes(q)));
  }, [catalogue, q]);

  const cartLines = (catalogue ?? [])
    .filter((r) => (cart[r.event_item_id] ?? 0) > 0)
    .map((r) => ({ row: r, qty: cart[r.event_item_id] }));
  const subtotal = cartLines.reduce((sum, l) => sum + l.row.price_idr * l.qty, 0);
  const itemCount = cartLines.reduce((sum, l) => sum + l.qty, 0);
  const dpPercent = Number(selectedEvent?.dp_percent ?? 0);
  const nominalDue = paymentType === "full" ? subtotal : Math.ceil((subtotal * dpPercent) / 100);

  function chooseEvent(id: string) {
    if (id === eventId) return;
    // Satu order = satu batch; buku dari batch lain tidak boleh ikut terbawa.
    setCart({});
    setSearch("");
    setEventId(id);
  }

  function setQty(itemId: string, qty: number) {
    // Fungsional: klik +/- dan aksi lain dalam satu tick tidak saling menimpa.
    setCart((c) => ({ ...c, [itemId]: Math.max(0, qty) }));
  }

  // Semua pemeriksaan dievaluasi saat submit — tidak ada lagi gerbang per langkah.
  // Server tetap penjaga sebenarnya; ini supaya pesannya ramah, bukan error Postgres.
  function validate(): string | null {
    if (!fullName.trim()) return "Nama wajib diisi.";
    if (whatsapp.replace(/\D/g, "").length < 10) return "Nomor WA belum lengkap. Contoh: 08123456789";
    if (!eventId) return "Pilih batch dulu.";
    if (cartLines.length === 0) return "Pilih minimal satu buku.";
    if (!agreed) return "Centang persetujuan syarat & ketentuan dulu.";
    return null;
  }

  async function submit() {
    const err = validate();
    if (err) return setError(err);
    setSubmitting(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_order", {
      p_idempotency_key: idempotencyKey,
      p_full_name: fullName.trim(),
      p_whatsapp: whatsapp,
      p_instagram: instagram.trim(),
      p_event_id: eventId,
      p_items: cartLines.map((l) => ({ event_item_id: l.row.event_item_id, qty: l.qty })),
      p_payment_type: paymentType,
      p_customer_notes: customerNotes.trim(),
    });
    setSubmitting(false);
    if (error) {
      // Pesan dari RPC sudah ramah (raise exception berbahasa Indonesia);
      // error lain (jaringan, dsb.) aman dicoba ulang berkat idempotency key.
      return setError(error.code === "P0001" ? error.message : "Order gagal terkirim. Coba lagi, order tidak akan dobel.");
    }
    const row = data?.[0];
    if (!row) return setError("Order mungkin sudah tercatat tapi konfirmasinya tidak terbaca. Tekan Kirim Order lagi, order tidak akan dobel.");
    setResult(row);
    window.scrollTo({ top: 0 });
  }

  if (result) return <OrderSuccess result={result} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Form order</h1>
      <p className="mt-2 text-sm text-ink-muted">Isi dari atas ke bawah. Ringkasannya ikut berubah sambil kamu isi.</p>

      {loadError && (
        <p className="mt-6 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger" role="alert">
          Data batch gagal dimuat. Periksa koneksi lalu muat ulang halaman.
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_19rem]">
        <div className="flex flex-col gap-5">
          <Section n={1} title="Data diri">
            <p className="text-sm text-ink-muted">
              Pakai nama dan nomor WhatsApp yang sama dengan yang kamu pakai menghubungi kami.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Nama lengkap
                <input maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className={INPUT} />
              </label>
              <label className="block text-sm font-medium">
                Nomor WhatsApp
                <input
                  inputMode="tel"
                  maxLength={25}
                  placeholder="08123456789"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  autoComplete="tel"
                  className={INPUT}
                />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Instagram <span className="font-normal text-ink-faint">(opsional)</span>
                <input maxLength={50} value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@username" className={INPUT} />
              </label>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Pelanggan lama: pakai nomor yang sama supaya kode pelacakanmu tetap.
            </p>
          </Section>

          <Section n={2} title="Pilih batch">
            <p className="text-sm text-ink-muted">Satu order untuk satu batch. Ganti batch akan mengosongkan pilihan bukumu.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {events === null && <p className="text-sm text-ink-muted">Memuat batch…</p>}
              {events?.length === 0 && !loadError && (
                <p className="text-sm text-ink-muted sm:col-span-2">
                  Belum ada batch dengan katalog yang buka.{" "}
                  <Link href="/ongoing" className="font-medium text-link hover:underline">
                    Lihat batch berjalan
                  </Link>
                </p>
              )}
              {events?.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => chooseEvent(ev.id)}
                  aria-pressed={eventId === ev.id}
                  className={`card press p-4 text-left ${eventId === ev.id ? "bg-primary-soft" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <TypeChip type={ev.type} />
                    {eventId === ev.id && <span className="text-xs font-bold">✓ dipilih</span>}
                  </span>
                  <p className="mt-1.5 font-bold">{ev.name}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    DP {Number(ev.dp_percent)}%
                    {ev.eta_note ? ` · tiba ${ev.eta_note}` : ""}
                    {ev.closes_at ? ` · tutup ${formatDateID(ev.closes_at)}` : ""}
                  </p>
                </button>
              ))}
            </div>
          </Section>

          <Section n={3} title="Pilih buku">
            {!eventId ? (
              <p className="text-sm text-ink-muted">Pilih batch dulu di atas.</p>
            ) : (
              <>
                <label className="block text-sm font-medium">
                  Cari judul, penulis, atau ISBN
                  <input
                    type="search"
                    placeholder="Ketik untuk mencari buku…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={`${INPUT} rounded-full`}
                  />
                </label>

                {catalogue === null ? (
                  <p className="py-6 text-sm text-ink-muted">Memuat katalog…</p>
                ) : q === "" ? (
                  <p className="mt-3 text-xs text-ink-muted">
                    Belum tahu isinya?{" "}
                    <Link href={`/catalogue?event=${eventId}`} target="_blank" className="font-medium text-link hover:underline">
                      Lihat katalog batch ini
                    </Link>{" "}
                    ({catalogue.length} buku).
                  </p>
                ) : matches.length === 0 ? (
                  <p className="mt-3 text-sm text-ink-muted">Tidak ada buku yang cocok dengan &ldquo;{search}&rdquo;.</p>
                ) : (
                  <ul className="mt-3 flex max-h-80 flex-col divide-y-1 divide-line overflow-y-auto">
                    {matches.map((r) => (
                      <BookLine
                        key={r.event_item_id}
                        row={r}
                        qty={cart[r.event_item_id] ?? 0}
                        onQty={(v) => {
                          setQty(r.event_item_id, v);
                          // Buku yang baru ditambah cukup tampil di "Buku dipilih", tidak dobel di hasil cari.
                          setSearch("");
                        }}
                      />
                    ))}
                  </ul>
                )}

                <div className="mt-5 border-t-1 border-line pt-4">
                  <p className="text-xs font-bold tracking-wide text-ink-muted">BUKU DIPILIH ({itemCount})</p>
                  {cartLines.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-muted">Belum ada buku dipilih.</p>
                  ) : (
                    <ul className="mt-2 flex flex-col divide-y-1 divide-line">
                      {cartLines.map((l) => (
                        <BookLine
                          key={l.row.event_item_id}
                          row={l.row}
                          qty={l.qty}
                          onQty={(v) => setQty(l.row.event_item_id, v)}
                          removable
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </Section>

          <Section n={4} title="Pembayaran">
            <fieldset>
              <legend className="text-sm font-medium">Mau bayar berapa sekarang?</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(["dp", "full"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPaymentType(t)}
                    aria-pressed={paymentType === t}
                    className={`card press p-3 text-left text-sm ${paymentType === t ? "bg-primary-soft" : ""}`}
                  >
                    <span className="block font-bold">{t === "dp" ? `DP ${dpPercent}%` : "Lunas"}</span>
                    <span className="mt-0.5 block font-bold tabular-nums text-accent-ink">
                      {formatIDR(t === "dp" ? Math.ceil((subtotal * dpPercent) / 100) : subtotal)}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="mt-4 rounded-md border border-ink bg-sky-soft p-3 text-sm">
              {paymentType === "dp"
                ? "Sisa tagihan dilunasi saat buku tiba di Indonesia. Kami kabari lewat WhatsApp."
                : "Tidak ada tagihan lagi setelah pembayaran ini terverifikasi (di luar ongkir)."}
            </p>
            <label className="mt-4 block text-sm font-medium">
              Catatan untuk admin <span className="font-normal text-ink-faint">(opsional)</span>
              <textarea maxLength={1000} value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={2} className={INPUT} />
            </label>
          </Section>

          <Section n={5} title="Konfirmasi">
            <label className="flex items-start gap-2.5 rounded-md border border-ink bg-surface-sunken p-3 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Saya sudah membaca{" "}
                <Link href="/terms" target="_blank" className="font-medium text-link hover:underline">
                  syarat &amp; ketentuan
                </Link>{" "}
                dan setuju dengan harga di atas.
              </span>
            </label>
          </Section>
        </div>

        <aside className="card bg-primary-soft p-5 lg:sticky lg:top-6">
          <p className="text-xs font-bold tracking-wide text-ink-muted">RINGKASAN</p>
          <h2 className="font-display text-xl font-bold">Slip Order</h2>
          <dl className="mt-4 flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Batch</dt>
              <dd className="text-right font-semibold">{selectedEvent?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Jumlah buku</dt>
              <dd className="font-semibold tabular-nums">{itemCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Total</dt>
              <dd className="font-semibold tabular-nums">{formatIDR(subtotal)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex justify-between gap-3 border-t-1 border-ink pt-3 font-bold text-accent-ink">
            <span>{paymentType === "dp" ? `Bayar sekarang (DP ${dpPercent}%)` : "Bayar sekarang (lunas)"}</span>
            <span className="tabular-nums">{formatIDR(nominalDue)}</span>
          </div>

          {error && (
            <p className="mt-4 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="btn btn-primary press mt-4 w-full px-4 py-3 text-sm disabled:opacity-60"
          >
            {submitting ? "Mengirim…" : "Kirim Order"}
          </button>
          <p className="mt-2 text-xs text-ink-muted">
            Kode pelacakan dan nomor rekening tampil langsung setelah ini.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2.5 font-display text-lg font-bold">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink bg-primary text-sm font-bold tabular-nums">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function BookLine({
  row,
  qty,
  onQty,
  removable = false,
}: {
  row: CatalogueRow;
  qty: number;
  onQty: (q: number) => void;
  removable?: boolean;
}) {
  const soldOut = row.stock_left === 0;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="w-12 shrink-0">
        <BookCover compact title={row.title} coverUrl={row.cover_url} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug">{row.title}</p>
        <p className="text-xs text-ink-muted">{[row.author, BOOK_FORMAT_LABEL[row.format]].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold tabular-nums text-accent-ink">
          {formatIDR(row.price_idr)}
          {qty > 0 && <span className="text-ink-muted">× {qty} = {formatIDR(row.price_idr * qty)}</span>}
          {row.stock_left !== null && (
            <span
              className={`rounded-full border-[1.5px] border-ink px-2 py-0.5 text-xs font-bold text-ink ${
                soldOut ? "bg-danger-soft text-danger" : "bg-type-ready"
              }`}
            >
              {soldOut ? "Habis" : `Sisa ${row.stock_left}`}
            </span>
          )}
        </p>
      </div>
      {qty === 0 ? (
        <button
          type="button"
          onClick={() => onQty(1)}
          disabled={soldOut}
          className="btn btn-secondary press shrink-0 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Tambah
        </button>
      ) : (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <QtyStepper label={row.title} qty={qty} max={row.stock_left ?? undefined} onChange={onQty} />
          {removable && (
            <button type="button" onClick={() => onQty(0)} className="text-xs font-semibold text-danger hover:underline">
              Hapus
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function QtyStepper({
  label,
  qty,
  max,
  onChange,
}: {
  label: string;
  qty: number;
  max?: number;
  onChange: (q: number) => void;
}) {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none hover:bg-primary-soft disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-ink bg-surface p-0.5">
      <button type="button" aria-label={`Kurangi ${label}`} onClick={() => onChange(qty - 1)} disabled={qty <= 0} className={btn}>
        −
      </button>
      <span className="w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`Tambah ${label}`}
        onClick={() => onChange(qty + 1)}
        disabled={max !== undefined && qty >= max}
        className={btn}
      >
        +
      </button>
    </div>
  );
}

function OrderSuccess({ result }: { result: OrderResult }) {
  const [copied, setCopied] = useState<string | null>(null);
  const banks = (result.bank_accounts as unknown as BankAccount[]) ?? [];
  const code = result.customer_code as string | null;

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="card relative bg-primary p-6 text-center shadow-hard sm:p-8">
        <StarSticker className="absolute -left-5 -top-5 w-14" />
        <DaisySticker className="absolute -bottom-6 -right-6 w-16" />
        {code ? (
          <>
            <p className="text-sm text-ink/75">Order {result.order_code} tercatat. Kode pelacakanmu:</p>
            <button
              type="button"
              onClick={() => copy(code)}
              className="mt-2 font-display text-5xl font-extrabold tracking-wider hover:opacity-90"
            >
              {code}
            </button>
            <p className="mt-1 text-xs text-ink/75">{copied === code ? "Tersalin" : "Ketuk untuk menyalin · simpan kode ini"}</p>
          </>
        ) : (
          // Nomor WA sudah terdaftar: kode lama tidak ditampilkan ke siapa pun
          // yang sekadar tahu nomornya (kode = kunci Lacak Order & Form Kirim).
          <>
            <p className="font-display text-3xl font-semibold">Order {result.order_code} tercatat</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink/75">
              Nomor WhatsApp ini sudah terdaftar. Order baru masuk ke kode pelacakan yang sudah kamu punya, jadi pakai kode itu
              di Lacak Order untuk upload bukti transfer. Lupa kode? Chat admin.
            </p>
          </>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-ink-muted">Transfer sekarang</p>
          <p className="font-display text-3xl font-semibold tabular-nums text-accent-ink">{formatIDR(result.nominal_due_idr)}</p>
        </div>
        <p className="mt-1 text-right text-xs text-ink-muted">dari total {formatIDR(result.total_idr)}</p>

        <div className="mt-5 flex flex-col gap-2">
          {banks.map((b) => (
            <div key={b.account_number} className="flex items-center justify-between gap-3 rounded-md bg-surface-sunken p-3">
              <div>
                <p className="text-sm font-semibold">
                  {b.bank} <span className="tabular-nums">{b.account_number}</span>
                </p>
                <p className="text-xs text-ink-muted">a.n. {b.holder}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(b.account_number)}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold"
              >
                {copied === b.account_number ? "Tersalin" : "Salin"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
        {code && (
          <>
            <h2 className="font-display text-xl font-semibold">Upload bukti transfer</h2>
            <div className="mt-4">
              <PaymentProofUpload
                orderId={result.order_id}
                orderCode={result.order_code}
                customerCode={code}
                defaultAmount={result.nominal_due_idr}
              />
            </div>
          </>
        )}

        <a
          href={waLink(
            result.wa_admin_number,
            `Halo Admin, saya sudah order ${result.order_code} ${code ? `(kode ${code}) ` : ""}dan transfer ${formatIDR(result.nominal_due_idr)}.`,
          )}
          target="_blank"
          rel="noopener noreferrer"
          className={`${code ? "mt-6" : ""} btn btn-wa press flex w-full px-4 py-3 text-sm`}
        >
          Konfirmasi via WhatsApp
        </a>
        <p className="mt-2 text-center text-xs text-ink-muted">Order tanpa konfirmasi tidak diproses.</p>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href={code ? `/track?code=${code}` : "/track"} className="font-medium text-link hover:underline">
          Lihat status order di Lacak Order
        </Link>
      </p>
    </div>
  );
}
