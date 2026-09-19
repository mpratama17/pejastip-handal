"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { useSiteSettings, waLink } from "@/lib/site-settings";
import { StatusChip } from "@/components/status-chip";
import { StarSticker } from "@/components/public/stickers";
import { PaymentProofUpload } from "@/components/public/payment-proof-upload";
import type { Database } from "@/types/database";

type TrackerRow = Database["public"]["Functions"]["get_tracker"]["Returns"][number];
type TrackerItem = {
  title: string;
  qty: number;
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
    setOrders(data ?? []);
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
    <div className="mx-auto max-w-2xl px-4 py-10">
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

      <div className="mt-6 flex flex-col gap-4">
        {orders?.map((o) => {
          const items = (o.items as unknown as TrackerItem[]) ?? [];
          const payments = (o.payments as unknown as TrackerPayment[]) ?? [];
          const cancelled = o.order_status === "cancelled";
          const owes = !cancelled && o.balance_idr > 0;
          return (
            <article key={o.order_id} className="card p-5 sm:p-6">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">{o.order_code}</h2>
                  <p className="text-sm text-ink-muted">
                    {o.event_name} · {formatDateID(o.created_at)}
                  </p>
                </div>
                {cancelled || o.order_status === "completed" ? (
                  <StatusChip kind="order" status={o.order_status} />
                ) : (
                  <StatusChip kind="payment" status={o.payment_state} />
                )}
              </header>

              {cancelled ? (
                <p className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">
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
                <dl className="mt-4 grid grid-cols-3 gap-2 rounded-md border border-ink bg-surface-sunken p-3 text-sm">
                  <div>
                    <dt className="text-xs text-ink-muted">Total</dt>
                    <dd className="tabular-nums">{formatIDR(o.total_idr)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Terbayar</dt>
                    <dd className="tabular-nums">{formatIDR(o.paid_idr)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink-muted">Sisa tagihan</dt>
                    <dd className={`font-display text-lg font-semibold tabular-nums ${owes ? "text-accent-ink" : "text-success"}`}>
                      {formatIDR(o.balance_idr)}
                    </dd>
                  </div>
                </dl>
              )}

              <ul className="mt-4 divide-y-1 divide-line">
                {items.map((it, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p>
                        {it.title} <span className="text-ink-muted">× {it.qty}</span>
                      </p>
                      {it.tracking_number && (
                        <p className="mt-0.5 text-xs text-ink-muted">
                          Resi {it.courier}: <span className="font-semibold tabular-nums text-ink">{it.tracking_number}</span>
                        </p>
                      )}
                    </div>
                    {!cancelled && <StatusChip kind="shipping" status={it.shipping_status} />}
                  </li>
                ))}
              </ul>

              {/* Urutan enam status itu tidak terbaca dari chip satuan. Ditaruh
                  collapsed supaya yang sudah paham tidak terganggu, tapi yang
                  bingung "kenapa masih Belum Berangkat" punya tempat bertanya. */}
              {!cancelled && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-ink-muted">Arti status pengiriman</summary>
                  <div className="mt-2 rounded-md border-[1.5px] border-ink bg-surface-sunken p-3 text-xs">
                    <p className="font-semibold text-ink">Dari luar negeri ke admin</p>
                    <p className="mt-0.5 text-ink-muted">
                      Belum Berangkat, lalu Menuju Indonesia, lalu Tiba di Admin. Belum Berangkat berarti bukumu
                      belum jalan dari penjual di sana.
                    </p>
                    <p className="mt-2 font-semibold text-ink">Dari admin ke kamu</p>
                    <p className="mt-0.5 text-ink-muted">
                      Menunggu Kurir, lalu Dikirim ke Kamu, lalu Diterima. Nomor resi muncul begitu paketmu
                      diserahkan ke kurir.
                    </p>
                  </div>
                </details>
              )}

              {payments.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-ink-muted">
                    Riwayat pembayaran ({payments.length})
                    {payments.some((p) => p.status === "rejected") && (
                      <span className="ml-2 font-semibold text-danger">ada yang ditolak</span>
                    )}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {payments.map((p, i) => (
                      <li key={i} className="rounded-md border-[1.5px] border-ink bg-surface-sunken p-2.5">
                        <div className="flex justify-between gap-2">
                          <span className="tabular-nums">
                            {formatIDR(p.amount_idr)} <span className="text-ink-faint">· {formatDateID(p.created_at)}</span>
                          </span>
                          <span className={`font-semibold ${PAYMENT_REVIEW[p.status].className}`}>{PAYMENT_REVIEW[p.status].label}</span>
                        </div>
                        {p.note && <p className="mt-1 text-ink-muted">{p.note}</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {o.admin_notes && (
                <div className="mt-3 rounded-md border border-ink bg-sky-soft p-3 text-sm">
                  <p className="text-xs font-bold">Catatan admin</p>
                  <p className="mt-0.5 whitespace-pre-line">{o.admin_notes}</p>
                </div>
              )}

              {owes && (
                <div className="mt-4 border-t-1 border-line pt-4">
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
            </article>
          );
        })}
      </div>

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
  );
}
