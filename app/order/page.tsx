"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type BookRow = Database["public"]["Tables"]["books"]["Row"];
type EventItemRow = Database["public"]["Tables"]["event_items"]["Row"] & { books: BookRow };
type OrderResult = Database["public"]["Functions"]["create_order"]["Returns"][number];

const STEP_LABELS = ["Data Diri", "Pilih Batch", "Pilih Buku", "Pembayaran", "Konfirmasi"];
const INPUT_CLASS =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function OrderPage() {
  const [step, setStep] = useState(1);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [events, setEvents] = useState<EventRow[]>([]);
  const [items, setItems] = useState<EventItemRow[]>([]);
  const [search, setSearch] = useState("");

  const [fullName, setFullName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [eventId, setEventId] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({}); // event_item_id -> qty
  const [paymentType, setPaymentType] = useState<"dp" | "full">("dp");
  const [customerNotes, setCustomerNotes] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);

  useEffect(() => {
    async function load() {
      const [eventsRes, itemsRes] = await Promise.all([
        supabase.from("events").select("*").eq("status", "open"),
        supabase.from("event_items").select("*, books(*)").eq("is_active", true),
      ]);
      const itemsData = (itemsRes.data as unknown as EventItemRow[]) ?? [];
      setItems(itemsData);
      const eventIdsWithCatalog = new Set(itemsData.map((i) => i.event_id));
      setEvents((eventsRes.data ?? []).filter((e) => eventIdsWithCatalog.has(e.id)));
    }
    load();
  }, []);

  const selectedEvent = events.find((e) => e.id === eventId);
  const eventItems = items.filter((i) => i.event_id === eventId);
  const filteredItems = useMemo(() => {
    if (!search) return eventItems;
    const q = search.toLowerCase();
    return eventItems.filter(
      (i) => i.books.title.toLowerCase().includes(q) || i.books.author?.toLowerCase().includes(q),
    );
  }, [eventItems, search]);

  const cartLines = Object.entries(cart)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ item: items.find((i) => i.id === id)!, qty }))
    .filter((l) => l.item);
  const subtotal = cartLines.reduce((sum, l) => sum + l.item.price_idr * l.qty, 0);
  const dpPercent = Number(selectedEvent?.dp_percent ?? 0);
  const nominalDue = paymentType === "full" ? subtotal : Math.ceil((subtotal * dpPercent) / 100);

  function setQty(itemId: string, qty: number) {
    setCart((c) => ({ ...c, [itemId]: Math.max(0, qty) }));
  }

  function validateStep(): string | null {
    if (step === 1) {
      if (!fullName.trim()) return "Nama wajib diisi.";
      if (!/^[0-9+ -]{8,}$/.test(whatsapp)) return "Nomor WA belum benar. Contoh: 08123456789";
    }
    if (step === 2 && !eventId) return "Pilih batch dulu.";
    if (step === 3 && cartLines.length === 0) return "Pilih minimal satu buku.";
    if (step === 5 && !agreed) return "Centang dulu persetujuan syarat & ketentuan.";
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(5, s + 1));
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data, error } = await supabase.rpc("create_order", {
      p_idempotency_key: idempotencyKey,
      p_full_name: fullName,
      p_whatsapp: whatsapp,
      p_instagram: instagram || "",
      p_event_id: eventId,
      p_items: cartLines.map((l) => ({ event_item_id: l.item.id, qty: l.qty })),
      p_payment_type: paymentType,
      p_customer_notes: customerNotes,
    });

    setSubmitting(false);
    if (error) {
      setError(readableOrderError(error.message));
      return;
    }
    setResult(data?.[0] ?? null);
  }

  if (result) return <OrderSuccess result={result} />;

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-bg px-4 py-8 text-ink">
      <p className="font-display text-lg italic text-ink">Pejastip Handal</p>
      <h1 className="mt-1 font-display text-xl font-semibold">Form Order</h1>

      <div className="mt-4 flex items-center gap-1 text-xs text-ink-muted">
        <span>
          Langkah {step} dari 5 — {STEP_LABELS[step - 1]}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {STEP_LABELS.map((_, i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-surface-sunken"}`} />
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface p-5">
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <Field label="Nama lengkap">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Nomor WhatsApp" help="Nomor ini kami pakai untuk konfirmasi order — pastikan aktif.">
              <input
                inputMode="numeric"
                placeholder="08123456789"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="Instagram (opsional)">
              <input value={instagram} onChange={(e) => setInstagram(e.target.value)} className={INPUT_CLASS} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {events.length === 0 && <p className="text-sm text-ink-muted">Belum ada batch yang buka saat ini.</p>}
            {events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => setEventId(ev.id)}
                className={`rounded-md border p-4 text-left ${
                  eventId === ev.id ? "border-primary bg-primary-soft" : "border-border"
                }`}
              >
                <p className="font-semibold text-ink">{ev.name}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  DP {ev.dp_percent}% {ev.eta_note ? `· ${ev.eta_note}` : ""}
                </p>
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div>
            <input
              placeholder="Cari judul atau penulis…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={INPUT_CLASS}
            />
            <div className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
              {filteredItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{item.books.title}</p>
                    <p className="text-xs text-ink-muted">{formatIDR(item.price_idr)}</p>
                  </div>
                  <QtyStepper
                    qty={cart[item.id] ?? 0}
                    max={item.stock ?? undefined}
                    onChange={(q) => setQty(item.id, q)}
                  />
                </div>
              ))}
            </div>
            {cartLines.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-semibold text-ink-muted">Buku terpilih</p>
                {cartLines.map((l) => (
                  <div key={l.item.id} className="mt-1 flex justify-between text-sm">
                    <span>
                      {l.item.books.title} × {l.qty}
                    </span>
                    <span className="tabular-nums">{formatIDR(l.item.price_idr * l.qty)}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between text-sm font-semibold">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatIDR(subtotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-ink">Jenis pembayaran</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setPaymentType("dp")}
                  className={`flex-1 rounded-md border p-3 text-sm ${paymentType === "dp" ? "border-primary bg-primary-soft" : "border-border"}`}
                >
                  DP {dpPercent}%
                </button>
                <button
                  onClick={() => setPaymentType("full")}
                  className={`flex-1 rounded-md border p-3 text-sm ${paymentType === "full" ? "border-primary bg-primary-soft" : "border-border"}`}
                >
                  Lunas
                </button>
              </div>
            </div>
            <div className="rounded-md bg-surface-sunken p-3 text-sm">
              Kamu akan membayar {paymentType === "dp" ? "DP" : "lunas"}{" "}
              <span className="font-semibold tabular-nums">{formatIDR(nominalDue)}</span> dari total{" "}
              <span className="tabular-nums">{formatIDR(subtotal)}</span>.
            </div>
            <Field label="Catatan (opsional)">
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                rows={2}
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md bg-surface-sunken p-3 text-sm">
              <p className="font-semibold">{selectedEvent?.name}</p>
              {cartLines.map((l) => (
                <div key={l.item.id} className="mt-1 flex justify-between">
                  <span>
                    {l.item.books.title} × {l.qty}
                  </span>
                  <span className="tabular-nums">{formatIDR(l.item.price_idr * l.qty)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatIDR(subtotal)}</span>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
              Saya setuju dengan syarat &amp; ketentuan dan memahami harga final di atas.
            </label>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <div className="mt-6 flex gap-3">
          {step > 1 && (
            <button onClick={back} className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-ink">
              Kembali
            </button>
          )}
          {step < 5 ? (
            <button
              onClick={next}
              className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Lanjut
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? "Mengirim…" : "Kirim Order"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function readableOrderError(message: string): string {
  if (message.includes("Terlalu banyak")) return message;
  if (message.includes("tidak dapat diproses")) return message;
  if (message.includes("tidak menerima order")) return message;
  if (message.includes("Stok tidak cukup")) return message;
  if (message.includes("tidak tersedia")) return message;
  return "Order gagal dikirim. Periksa lagi isian kamu, lalu coba lagi.";
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink">{label}</label>
      <div className="mt-1">{children}</div>
      {help && <p className="mt-1 text-xs text-ink-muted">{help}</p>}
    </div>
  );
}

function QtyStepper({ qty, max, onChange }: { qty: number; max?: number; onChange: (q: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(qty - 1)}
        disabled={qty <= 0}
        className="h-7 w-7 rounded-sm border border-border text-ink disabled:opacity-40"
      >
        −
      </button>
      <span className="w-4 text-center text-sm tabular-nums">{qty}</span>
      <button
        onClick={() => onChange(qty + 1)}
        disabled={max !== undefined && qty >= max}
        className="h-7 w-7 rounded-sm border border-border text-ink disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

function OrderSuccess({ result }: { result: OrderResult }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const bankAccounts = (result.bank_accounts as unknown as { bank: string; account_number: string; holder: string }[]) ?? [];
  const waDigits = result.wa_admin_number.replace(/\D/g, "");
  const waText = encodeURIComponent(
    `Halo Admin, saya sudah order ${result.order_code} (kode: ${result.customer_code}), mau konfirmasi pembayaran ${formatIDR(result.nominal_due_idr)}.`,
  );

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    const path = `${result.order_id}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("payment-proofs").upload(path, file);
    if (uploadError) {
      setUploading(false);
      setUploadMsg(`Upload gagal: ${uploadError.message}`);
      return;
    }
    const { error: rpcError } = await supabase.rpc("submit_payment_proof", {
      p_customer_code: result.customer_code,
      p_order_code: result.order_code,
      p_amount_idr: result.nominal_due_idr,
      p_method: "bank_transfer",
      p_paid_at: new Date().toISOString().slice(0, 10),
      p_proof_path: path,
    });
    setUploading(false);
    if (rpcError) {
      setUploadMsg(`Gagal menyimpan bukti: ${rpcError.message}`);
      return;
    }
    setUploadMsg("Bukti transfer terkirim. Menunggu verifikasi admin.");
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-bg px-4 py-8 text-ink">
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-ink-muted">Order berhasil dikirim</p>
        <p className="mt-1 font-display text-2xl font-semibold italic">{result.customer_code}</p>
        <p className="mt-1 text-xs text-ink-muted">Simpan kode ini — dipakai untuk lacak order di /track</p>
        <p className="mt-4 text-sm">
          {result.order_code} · Total {formatIDR(result.total_idr)}
        </p>
        <p className="mt-1 text-sm font-semibold text-accent">Transfer {formatIDR(result.nominal_due_idr)}</p>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-ink">Rekening tujuan</p>
        {bankAccounts.map((b, i) => (
          <p key={i} className="mt-1 text-sm text-ink-muted">
            {b.bank} {b.account_number} a.n. {b.holder}
          </p>
        ))}

        <p className="mt-4 text-sm font-semibold text-ink">Upload bukti transfer</p>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 text-sm"
        />
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="mt-2 block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {uploading ? "Mengunggah…" : "Upload Bukti"}
        </button>
        {uploadMsg && <p className="mt-2 text-sm text-ink-muted">{uploadMsg}</p>}

        <a
          href={`https://wa.me/${waDigits}?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-[#0B3B22]"
        >
          Konfirmasi via WhatsApp
        </a>
        <p className="mt-2 text-xs text-ink-muted">Order tanpa konfirmasi tidak diproses.</p>
      </div>
    </div>
  );
}
