"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { BOOK_FORMAT_LABEL, EVENT_TYPE_LABEL } from "@/lib/labels";
import { waLink, type BankAccount } from "@/lib/site-settings";
import { BookCover } from "@/components/public/book-cover";
import { PaymentProofUpload } from "@/components/public/payment-proof-upload";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type CatalogueRow = Database["public"]["Functions"]["get_catalogue"]["Returns"][number];
type OrderResult = Database["public"]["Functions"]["create_order"]["Returns"][number];

const STEPS = ["Data diri", "Pilih batch", "Pilih buku", "Pembayaran", "Konfirmasi"];
const INPUT =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function OrderPage() {
  return (
    <Suspense fallback={null}>
      <OrderForm />
    </Suspense>
  );
}

function OrderForm() {
  const presetEvent = useSearchParams().get("event");
  const [step, setStep] = useState(1);
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
  const [result, setResult] = useState<OrderResult | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("events").select("*").eq("status", "open").order("closes_at", { ascending: true, nullsFirst: false }),
      supabase.from("event_items").select("event_id"),
    ]).then(([ev, items]) => {
      if (ev.error || items.error) return setLoadError(true);
      // Batch tanpa katalog dipesan lewat WhatsApp, bukan form (docs/02).
      const withItems = new Set((items.data ?? []).map((i) => i.event_id));
      const list = (ev.data ?? []).filter((e) => withItems.has(e.id));
      setEvents(list);
      if (presetEvent && list.some((e) => e.id === presetEvent)) setEventId(presetEvent);
      else if (list.length === 1) setEventId(list[0].id);
    });
  }, [presetEvent]);

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
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!catalogue || !q) return catalogue ?? [];
    return catalogue.filter((r) => [r.title, r.author, r.isbn].some((v) => v?.toLowerCase().includes(q)));
  }, [catalogue, search]);

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

  function validate(): string | null {
    if (step === 1) {
      if (!fullName.trim()) return "Nama wajib diisi.";
      if (whatsapp.replace(/\D/g, "").length < 10) return "Nomor WA belum lengkap. Contoh: 08123456789";
    }
    if (step === 2 && !eventId) return "Pilih batch dulu.";
    if (step === 3 && cartLines.length === 0) return "Pilih minimal satu buku.";
    if (step === 5 && !agreed) return "Centang persetujuan syarat & ketentuan dulu.";
    return null;
  }

  function go(delta: 1 | -1) {
    if (delta === 1) {
      const err = validate();
      if (err) return setError(err);
    }
    setError(null);
    setStep((s) => Math.min(5, Math.max(1, s + delta)));
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      return setError(error.code === "P0001" ? error.message : "Order gagal terkirim. Coba lagi — order tidak akan dobel.");
    }
    const row = data?.[0];
    if (!row) return setError("Order mungkin sudah tercatat tapi konfirmasinya tidak terbaca. Tekan Kirim Order lagi — order tidak akan dobel.");
    setResult(row);
    window.scrollTo({ top: 0 });
  }

  if (result) return <OrderSuccess result={result} />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Form order</h1>

      <div className="mt-5" aria-live="polite">
        <p className="text-sm text-ink-muted">
          Langkah {step} dari {STEPS.length} · <span className="font-medium text-ink">{STEPS[step - 1]}</span>
        </p>
        <div className="mt-2 flex gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-surface-sunken"}`} />
          ))}
        </div>
      </div>

      {loadError && (
        <p className="mt-6 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger" role="alert">
          Data batch gagal dimuat. Periksa koneksi lalu muat ulang halaman.
        </p>
      )}

      <div className="mt-6 rounded-lg border border-border bg-surface p-5 sm:p-6">
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <label className="block text-sm font-medium">
              Nama lengkap
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" className={INPUT} />
            </label>
            <label className="block text-sm font-medium">
              Nomor WhatsApp
              <input
                inputMode="tel"
                placeholder="08123456789"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                autoComplete="tel"
                className={INPUT}
              />
              <span className="mt-1 block text-xs font-normal text-ink-muted">
                Dipakai untuk konfirmasi order. Pelanggan lama: pakai nomor yang sama supaya kode pelacakanmu tetap.
              </span>
            </label>
            <label className="block text-sm font-medium">
              Instagram <span className="font-normal text-ink-faint">(opsional)</span>
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@username" className={INPUT} />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {events === null && <p className="text-sm text-ink-muted">Memuat batch…</p>}
            {events?.length === 0 && !loadError && (
              <p className="text-sm text-ink-muted">
                Belum ada batch dengan katalog yang buka.{" "}
                <Link href="/ongoing" className="font-medium text-primary hover:underline">
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
                className={`rounded-md border p-4 text-left transition-colors ${
                  eventId === ev.id ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong"
                }`}
              >
                <p className="font-semibold">{ev.name}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {EVENT_TYPE_LABEL[ev.type]} · DP {Number(ev.dp_percent)}%
                  {ev.eta_note ? ` · tiba ${ev.eta_note}` : ""}
                  {ev.closes_at ? ` · tutup ${formatDateID(ev.closes_at)}` : ""}
                </p>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div>
            <input
              type="search"
              placeholder="Cari judul, penulis, atau ISBN"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={INPUT.replace("mt-1 ", "")}
            />
            {catalogue === null ? (
              <p className="py-8 text-center text-sm text-ink-muted">Memuat katalog…</p>
            ) : (
              <ul className="mt-3 flex max-h-[26rem] flex-col divide-y divide-border overflow-y-auto">
                {filtered.map((r) => {
                  const qty = cart[r.event_item_id] ?? 0;
                  const soldOut = r.stock_left === 0;
                  return (
                    <li key={r.event_item_id} className="flex items-center gap-3 py-3">
                      <div className="w-11 shrink-0">
                        <BookCover compact title={r.title} coverUrl={r.cover_url} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{r.title}</p>
                        <p className="text-xs text-ink-muted">
                          {[r.author, BOOK_FORMAT_LABEL[r.format]].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-accent">
                          {formatIDR(r.price_idr)}
                          {r.stock_left !== null && (
                            <span className={`ml-2 text-xs font-normal ${soldOut ? "text-danger" : "text-ink-muted"}`}>
                              {soldOut ? "Habis" : `sisa ${r.stock_left}`}
                            </span>
                          )}
                        </p>
                      </div>
                      <QtyStepper
                        label={r.title}
                        qty={qty}
                        max={r.stock_left ?? undefined}
                        onChange={(q) => setCart((c) => ({ ...c, [r.event_item_id]: q }))}
                      />
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="py-8 text-center text-sm text-ink-muted">Tidak ada buku yang cocok.</li>
                )}
              </ul>
            )}
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
              <span className="text-ink-muted">{itemCount} buku dipilih</span>
              <span className="font-semibold tabular-nums">{formatIDR(subtotal)}</span>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-5">
            <fieldset>
              <legend className="text-sm font-medium">Mau bayar berapa sekarang?</legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {(["dp", "full"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPaymentType(t)}
                    aria-pressed={paymentType === t}
                    className={`rounded-md border p-3 text-left text-sm ${
                      paymentType === t ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong"
                    }`}
                  >
                    <span className="block font-semibold">{t === "dp" ? `DP ${dpPercent}%` : "Lunas"}</span>
                    <span className="mt-0.5 block tabular-nums text-ink-muted">
                      {formatIDR(t === "dp" ? Math.ceil((subtotal * dpPercent) / 100) : subtotal)}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="rounded-md bg-surface-sunken p-3 text-sm">
              {paymentType === "dp"
                ? "Sisa tagihan dilunasi saat buku tiba di Indonesia — kami kabari lewat WhatsApp."
                : "Tidak ada tagihan lagi setelah pembayaran ini terverifikasi (di luar ongkir)."}
            </p>
            <label className="block text-sm font-medium">
              Catatan untuk admin <span className="font-normal text-ink-faint">(opsional)</span>
              <textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={2} className={INPUT} />
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">Nama</dt>
              <dd>{fullName}</dd>
              <dt className="text-ink-muted">WhatsApp</dt>
              <dd className="tabular-nums">{whatsapp}</dd>
              <dt className="text-ink-muted">Batch</dt>
              <dd>{selectedEvent?.name}</dd>
            </dl>
            <div className="rounded-md bg-surface-sunken p-4 text-sm">
              {cartLines.map((l) => (
                <div key={l.row.event_item_id} className="flex justify-between gap-3 py-0.5">
                  <span>
                    {l.row.title} <span className="text-ink-muted">× {l.qty}</span>
                  </span>
                  <span className="tabular-nums">{formatIDR(l.row.price_idr * l.qty)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatIDR(subtotal)}</span>
              </div>
              <div className="mt-1 flex justify-between font-semibold text-accent">
                <span>Bayar sekarang ({paymentType === "dp" ? `DP ${dpPercent}%` : "lunas"})</span>
                <span className="tabular-nums">{formatIDR(nominalDue)}</span>
              </div>
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
              />
              <span>
                Saya sudah membaca{" "}
                <Link href="/terms" target="_blank" className="font-medium text-primary hover:underline">
                  syarat &amp; ketentuan
                </Link>{" "}
                dan setuju dengan harga di atas.
              </span>
            </label>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          {step > 1 && (
            <button type="button" onClick={() => go(-1)} className="rounded-md border border-border px-4 py-3 text-sm font-semibold">
              Kembali
            </button>
          )}
          {step < 5 ? (
            <button
              type="button"
              onClick={() => go(1)}
              className="flex-1 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Lanjut
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? "Mengirim…" : "Kirim Order"}
            </button>
          )}
        </div>
      </div>
    </div>
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
    "flex h-9 w-9 items-center justify-center rounded-md border border-border text-lg leading-none disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" aria-label={`Kurangi ${label}`} onClick={() => onChange(qty - 1)} disabled={qty <= 0} className={btn}>
        −
      </button>
      <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">
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
      <div className="rounded-lg bg-jacket p-6 text-center text-bg sm:p-8">
        {code ? (
          <>
            <p className="text-sm text-bg/75">Order {result.order_code} tercatat. Kode pelacakanmu:</p>
            <button
              type="button"
              onClick={() => copy(code)}
              className="mt-2 font-display text-4xl font-semibold italic tracking-wide hover:opacity-90"
            >
              {code}
            </button>
            <p className="mt-1 text-xs text-bg/60">{copied === code ? "Tersalin" : "Ketuk untuk menyalin · simpan kode ini"}</p>
          </>
        ) : (
          // Nomor WA sudah terdaftar: kode lama tidak ditampilkan ke siapa pun
          // yang sekadar tahu nomornya (kode = kunci Lacak Order & Form Kirim).
          <>
            <p className="font-display text-3xl font-semibold italic">Order {result.order_code} tercatat</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-bg/75">
              Nomor WhatsApp ini sudah terdaftar. Order baru masuk ke kode pelacakan yang sudah kamu punya — pakai kode itu
              di Lacak Order untuk upload bukti transfer. Lupa kode? Chat admin.
            </p>
          </>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-ink-muted">Transfer sekarang</p>
          <p className="font-display text-3xl font-semibold tabular-nums text-accent">{formatIDR(result.nominal_due_idr)}</p>
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
          className={`${code ? "mt-6" : ""} block rounded-md bg-[#25D366] px-4 py-3 text-center text-sm font-semibold text-[#0b3b22] hover:brightness-95`}
        >
          Konfirmasi via WhatsApp
        </a>
        <p className="mt-2 text-center text-xs text-ink-muted">Order tanpa konfirmasi tidak diproses.</p>
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href={code ? `/track?code=${code}` : "/track"} className="font-medium text-primary hover:underline">
          Lihat status order di Lacak Order
        </Link>
      </p>
    </div>
  );
}
