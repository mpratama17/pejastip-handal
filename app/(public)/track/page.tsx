"use client";

import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { useSiteSettings, waLink } from "@/lib/site-settings";
import { SHIPPING_STATUS_MAP, StatusChip } from "@/components/status-chip";
import { StarSticker } from "@/components/public/stickers";
import { PaymentProofUpload } from "@/components/public/payment-proof-upload";
import type { Database } from "@/types/database";

type TrackerRow = Database["public"]["Functions"]["get_tracker"]["Returns"][number];
type TrackerItem = {
  title: string;
  qty: number;
  unit_price_idr?: number; // ada sejak migration 20261004
  shipping_status: string;
  courier: string | null;
  tracking_number: string | null;
};
type TrackerPayment = { amount_idr: number; status: "pending" | "verified" | "rejected"; note: string | null; created_at: string };

const PAYMENT_REVIEW: Record<TrackerPayment["status"], { label: string; className: string }> = {
  pending: { label: "Menunggu verifikasi", className: "text-warning" },
  verified: { label: "Terverifikasi", className: "text-success" },
  rejected: { label: "Ditolak", className: "text-danger" },
};

export default function TrackPage() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}

function Tracker() {
  const router = useRouter();
  const params = useSearchParams();
  const settings = useSiteSettings();
  const urlCode = params.get("code")?.trim().toUpperCase() ?? "";

  const [input, setInput] = useState(urlCode);
  const [orders, setOrders] = useState<TrackerRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  // Baris order yang detailnya terbuka. Satu order saja → langsung terbuka.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const lookup = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("get_tracker", { p_code: code });
    setLoading(false);
    if (error) {
      setOrders(null);
      setError(error.code === "P0001" ? error.message : "Gagal memuat. Periksa koneksi lalu coba lagi.");
      return;
    }
    // Kode salah = hasil kosong (bukan error), supaya tebakan salah ikut terhitung rate limit.
    if (!data || data.length === 0) {
      setOrders(null);
      setError("Kode tidak ditemukan. Periksa kembali atau hubungi admin.");
      return;
    }
    setOrders(data);
    // Muat ulang (mis. setelah upload bukti) tidak menutup baris yang sedang dibuka.
    if (data.length === 1) setOpen(new Set([data[0].order_id]));
  }, []);

  // Kode di URL = sumber kebenaran → bisa dibagikan/di-bookmark.
  useEffect(() => {
    setInput(urlCode);
    if (urlCode) lookup(urlCode);
    else setOrders(null);
  }, [urlCode, lookup]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = input.trim().toUpperCase();
    if (!code) return;
    if (code === urlCode) lookup(code);
    else router.replace(`/track?code=${code}`, { scroll: false });
  }

  return (
    <>
    {orders && orders.length > 0 && <OrderRecap orders={orders} code={urlCode} storeName={settings?.store_name ?? ""} />}
    <div className="mx-auto max-w-2xl px-4 py-10 print:hidden">
      <h1 className="font-display text-3xl font-bold">Lacak order</h1>
      <p className="mt-1 text-sm text-ink-muted">Masukkan kode pelacakan yang muncul setelah kamu order.</p>

      <form onSubmit={handleSubmit} className="card mt-6 flex flex-col gap-3 p-4 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Kode pelacakan</span>
          <input
            required
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Contoh: VNGB3554"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-full border border-ink px-5 py-3 font-display text-lg font-extrabold uppercase tracking-wider placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:normal-case placeholder:tracking-normal"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary press px-6 py-3 text-sm"
        >
          {loading ? "Mencari…" : "Lacak"}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-lg border border-ink bg-danger-soft p-4 text-sm text-danger" role="alert">
          {error}
          {settings?.wa_admin_number && (
            <a
              href={waLink(settings.wa_admin_number, "Halo Admin, saya lupa kode pelacakan order saya.")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block font-semibold underline underline-offset-2"
            >
              Lupa kode? Chat admin
            </a>
          )}
        </div>
      )}

      {orders?.length === 0 && (
        <div className="card relative mt-6 p-8 text-center">
          <StarSticker className="absolute -right-4 -top-4 w-12" />
          <p className="font-bold">Belum ada order aktif untuk kode ini.</p>
          <Link href="/ongoing" className="btn btn-secondary press mt-3 px-4 py-2 text-sm">
            Lihat batch yang sedang buka
          </Link>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">{orders.length} order untuk kode ini.</p>
          {/* Browser yang membuat PDF-nya (Simpan sebagai PDF) — tanpa library, jalan juga di HP. */}
          <button type="button" onClick={() => window.print()} className="btn btn-secondary press px-4 py-2 text-sm">
            Unduh rekap (PDF)
          </button>
        </div>
      )}

      {/* Satu baris per order; detail (buku, pembayaran, upload) dibuka per baris supaya
          customer dengan banyak order tetap bisa membandingkan sekilas. */}
      {orders && orders.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-ink bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-ink bg-surface-sunken text-left">
              <tr>
                <th className="py-2.5 pl-3 pr-2 font-semibold">Order</th>
                <th className="hidden py-2.5 pr-3 text-right font-semibold sm:table-cell">Total</th>
                <th className="py-2.5 pr-3 text-right font-semibold">Sisa tagihan</th>
                <th className="py-2.5 pr-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const items = (o.items as unknown as TrackerItem[]) ?? [];
                const payments = (o.payments as unknown as TrackerPayment[]) ?? [];
                const cancelled = o.order_status === "cancelled";
                const owes = !cancelled && o.balance_idr > 0;
                const isOpen = open.has(o.order_id);
                return (
                  <Fragment key={o.order_id}>
                    <tr className={`border-t-1 border-line align-top first:border-0 ${isOpen ? "bg-primary-soft" : ""}`}>
                      <td className="py-2.5 pl-3 pr-2">
                        <button
                          type="button"
                          onClick={() => toggle(o.order_id)}
                          aria-expanded={isOpen}
                          className="text-left"
                        >
                          <span className="block font-display font-bold">{o.order_code}</span>
                          <span className="block text-xs text-ink-muted">
                            {o.event_name} · {formatDateID(o.created_at)}
                          </span>
                          <span className="mt-0.5 block text-xs font-semibold text-link">
                            {isOpen ? "Tutup detail ▴" : `Lihat ${items.length} buku ▾`}
                          </span>
                        </button>
                      </td>
                      <td className="hidden py-2.5 pr-3 text-right tabular-nums sm:table-cell">{formatIDR(o.total_idr)}</td>
                      <td
                        className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${
                          cancelled ? "text-ink-faint" : owes ? "text-accent-ink" : "text-success"
                        }`}
                      >
                        {cancelled ? "—" : formatIDR(o.balance_idr)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {cancelled || o.order_status === "completed" ? (
                          <StatusChip kind="order" status={o.order_status} />
                        ) : (
                          <StatusChip kind="payment" status={o.payment_state} />
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-primary-soft/40">
                        <td colSpan={4} className="px-3 pb-4 pt-1">
                          {cancelled ? (
                            <p className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                              Order ini dibatalkan.
                              {o.paid_idr > 0 && (
                                <>
                                  {" "}Pembayaran {formatIDR(o.paid_idr)} akan diselesaikan admin
                                  {settings?.wa_admin_number && (
                                    <>
                                      {", silakan "}
                                      <a
                                        href={waLink(settings.wa_admin_number, `Halo Admin, order ${o.order_code} saya dibatalkan. Bagaimana dengan pembayaran saya?`)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold underline underline-offset-2"
                                      >
                                        chat admin
                                      </a>
                                    </>
                                  )}
                                  .
                                </>
                              )}
                            </p>
                          ) : (
                            <p className="text-xs text-ink-muted tabular-nums">
                              Total {formatIDR(o.total_idr)} · Terbayar {formatIDR(o.paid_idr)}
                            </p>
                          )}

                          <table className="mt-2 w-full text-sm">
                            <thead className="text-left text-xs text-ink-muted">
                              <tr>
                                <th className="py-1 pr-2 font-medium">Buku</th>
                                <th className="py-1 pr-2 text-right font-medium">Qty</th>
                                {!cancelled && <th className="py-1 font-medium">Status kirim</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it, i) => (
                                <tr key={i} className="border-t-1 border-line align-top">
                                  <td className="py-1.5 pr-2">
                                    {it.title}
                                    {it.tracking_number && (
                                      <span className="mt-0.5 block text-xs text-ink-muted">
                                        Resi {it.courier}: <span className="font-semibold tabular-nums text-ink">{it.tracking_number}</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-2 text-right tabular-nums">{it.qty}</td>
                                  {!cancelled && (
                                    <td className="py-1.5">
                                      <StatusChip kind="shipping" status={it.shipping_status} />
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {payments.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-bold text-ink-muted">
                                Riwayat pembayaran
                                {payments.some((p) => p.status === "rejected") && (
                                  <span className="ml-2 text-danger">ada yang ditolak</span>
                                )}
                              </p>
                              <ul className="mt-1 flex flex-col gap-1">
                                {payments.map((p, i) => (
                                  <li key={i} className="text-sm">
                                    <span className="tabular-nums">{formatIDR(p.amount_idr)}</span>{" "}
                                    <span className="text-ink-faint">· {formatDateID(p.created_at)} ·</span>{" "}
                                    <span className={`font-semibold ${PAYMENT_REVIEW[p.status].className}`}>{PAYMENT_REVIEW[p.status].label}</span>
                                    {p.note && <span className="block text-xs text-ink-muted">{p.note}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {o.admin_notes && (
                            <div className="mt-3 rounded-md border border-ink bg-sky-soft p-3 text-sm">
                              <p className="text-xs font-bold">Catatan admin</p>
                              <p className="mt-0.5 whitespace-pre-line">{o.admin_notes}</p>
                            </div>
                          )}

                          {owes && (
                            <div className="mt-3">
                              {uploadFor === o.order_id ? (
                                <PaymentProofUpload
                                  orderId={o.order_id}
                                  orderCode={o.order_code}
                                  customerCode={urlCode}
                                  defaultAmount={o.balance_idr}
                                  onUploaded={() => lookup(urlCode)}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setUploadFor(o.order_id)}
                                  className="btn btn-secondary press px-4 py-2 text-sm"
                                >
                                  Upload bukti pembayaran
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Urutan enam status itu tidak terbaca dari chip satuan — sekali di bawah tabel. */}
      {orders && orders.some((o) => o.order_status !== "cancelled") && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink-muted">Arti status pengiriman</summary>
          <div className="mt-2 rounded-md border-[1.5px] border-ink bg-surface-sunken p-3 text-xs">
            <p className="font-semibold text-ink">Dari luar negeri ke admin</p>
            <p className="mt-0.5 text-ink-muted">
              Ordered ke Publisher, lalu Menuju Indonesia, lalu Tiba di Admin. Ordered ke Publisher berarti
              bukumu dipesan dan belum jalan dari penjual di sana.
            </p>
            <p className="mt-2 font-semibold text-ink">Dari admin ke kamu</p>
            <p className="mt-0.5 text-ink-muted">
              Sedang Dikemas, lalu Dikirim ke Kamu, lalu Diterima. Nomor resi muncul begitu paketmu
              diserahkan ke kurir.
            </p>
          </div>
        </details>
      )}

      {/* Ajakan Form Kirim hanya saat ada buku yang benar-benar menunggu dikirim. */}
      {orders?.some(
        (o) =>
          o.order_status !== "cancelled" &&
          ((o.items as unknown as TrackerItem[]) ?? []).some((it) => it.shipping_status === "arrived_in_indo"),
      ) && (
        <p className="mt-6 text-center text-sm text-ink-muted">
          Buku sudah tiba dan lunas?{" "}
          <Link href={`/shipping?code=${urlCode}`} className="font-medium text-link hover:underline">
            Isi Form Kirim
          </Link>
        </p>
      )}
    </div>
    </>
  );
}

// Rekap semua order untuk dicetak / disimpan sebagai PDF. Hanya tampil saat print.
function OrderRecap({ orders, code, storeName }: { orders: TrackerRow[]; code: string; storeName: string }) {
  const active = orders.filter((o) => o.order_status !== "cancelled");
  const sum = (f: (o: TrackerRow) => number) => active.reduce((a, o) => a + f(o), 0);
  const cell = "border border-ink/40 px-2 py-1";
  return (
    <div className="hidden bg-white p-2 text-[11px] text-black print:block">
      <header className="flex items-end justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-lg font-bold">{storeName || "Rekap order"}</p>
          {/* Kode disamarkan: rekap gampang diteruskan, sedangkan kode + WA = kunci Form Kirim. */}
          <p>Rekap order · kode {code.slice(0, 4)}••••</p>
        </div>
        <p>Dicetak {formatDateID(new Date().toISOString())}</p>
      </header>

      {orders.map((o) => {
        const items = (o.items as unknown as TrackerItem[]) ?? [];
        const cancelled = o.order_status === "cancelled";
        return (
          <section key={o.order_id} className="mt-4 break-inside-avoid">
            <p className="font-bold">
              {o.order_code} · {o.event_name} · {formatDateID(o.created_at)}
              {cancelled && " · DIBATALKAN"}
            </p>
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className={cell}>Judul</th>
                  <th className={`${cell} text-right`}>Qty</th>
                  <th className={`${cell} text-right`}>Harga</th>
                  <th className={`${cell} text-right`}>Jumlah</th>
                  <th className={cell}>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className={cell}>{it.title}</td>
                    <td className={`${cell} text-right`}>{it.qty}</td>
                    <td className={`${cell} text-right tabular-nums`}>{it.unit_price_idr != null ? formatIDR(it.unit_price_idr) : "—"}</td>
                    <td className={`${cell} text-right tabular-nums`}>{it.unit_price_idr != null ? formatIDR(it.unit_price_idr * it.qty) : "—"}</td>
                    <td className={cell}>
                      {cancelled ? "Batal" : (SHIPPING_STATUS_MAP[it.shipping_status]?.label ?? it.shipping_status)}
                      {it.tracking_number ? ` · resi ${it.courier} ${it.tracking_number}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cancelled && (
              <p className="mt-1 text-right tabular-nums">
                {/* Total sudah dipotong diskon; tampilkan selisihnya supaya baris buku cocok dengan Total. */}
                {(() => {
                  const sub = items.reduce((a, it) => a + (it.unit_price_idr ?? 0) * it.qty, 0);
                  return items.every((it) => it.unit_price_idr != null) && sub > o.total_idr
                    ? `Subtotal ${formatIDR(sub)} · Diskon −${formatIDR(sub - o.total_idr)} · `
                    : "";
                })()}
                Total {formatIDR(o.total_idr)} · Terbayar {formatIDR(o.paid_idr)} · <b>Sisa {formatIDR(o.balance_idr)}</b>
              </p>
            )}
          </section>
        );
      })}

      <p className="mt-5 border-t-2 border-black pt-2 text-right text-xs tabular-nums">
        Semua order aktif — Total {formatIDR(sum((o) => o.total_idr))} · Terbayar {formatIDR(sum((o) => o.paid_idr))} ·{" "}
        <b>Sisa tagihan {formatIDR(sum((o) => o.balance_idr))}</b>
      </p>
    </div>
  );
}
