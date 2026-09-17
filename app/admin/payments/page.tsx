"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatIDR, formatDateID } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import type { Database } from "@/types/database";

type PaymentRow = Database["public"]["Tables"]["payments"]["Row"] & {
  orders: {
    id: string;
    order_code: string;
    total_idr: number;
    customers: { full_name: string; code: string; whatsapp: string } | null;
  } | null;
};
type OrderPayment = Database["public"]["Views"]["v_order_payment"]["Row"];
type Filter = "pending" | "reviewed";

const REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

export default function AdminPaymentsPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [balances, setBalances] = useState<Record<string, OrderPayment>>({});

  const load = useCallback(async () => {
    const query = supabase
      .from("payments")
      .select("*, orders(id, order_code, total_idr, customers(full_name, code, whatsapp))")
      .order("created_at", { ascending: filter === "pending" })
      .limit(100);
    const { data } = await (filter === "pending" ? query.eq("status", "pending") : query.neq("status", "pending"));
    const list = (data as unknown as PaymentRow[]) ?? [];
    setRows(list);

    const orderIds = [...new Set(list.map((p) => p.order_id))];
    if (orderIds.length) {
      const { data: vp } = await supabase.from("v_order_payment").select("*").in("order_id", orderIds);
      setBalances(Object.fromEntries((vp ?? []).map((r) => [r.order_id, r])));
    }
  }, [filter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-ink">Verifikasi pembayaran</h1>

      <div className="mt-4 flex gap-1 rounded-md bg-surface-sunken p-1 text-sm sm:inline-flex">
        {(["pending", "reviewed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 whitespace-nowrap rounded-sm px-4 py-1.5 font-medium ${filter === f ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            {f === "pending" ? "Menunggu" : "Riwayat"}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-ink-muted">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-8 text-center text-sm text-ink-muted">
          {filter === "pending" ? "Tidak ada bukti transfer yang menunggu." : "Belum ada riwayat verifikasi."}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {rows.map((p) => (
            <PaymentCard key={p.id} payment={p} balance={balances[p.order_id]} onReviewed={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentCard({
  payment,
  balance,
  onReviewed,
}: {
  payment: PaymentRow;
  balance?: OrderPayment;
  onReviewed: () => void;
}) {
  const [proofUrl, setProofUrl] = useState<string | null | "missing">(null);
  const [amount, setAmount] = useState(String(payment.amount_idr));
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPdf = payment.proof_url?.endsWith(".pdf");
  const pending = payment.status === "pending";

  useEffect(() => {
    if (!payment.proof_url) return;
    // Bucket privat: URL bertanda tangan, berlaku 1 jam (docs/03 R8).
    supabase.storage
      .from("payment-proofs")
      .createSignedUrl(payment.proof_url, 3600)
      .then(({ data }) => setProofUrl(data?.signedUrl ?? "missing"));
  }, [payment.proof_url]);

  async function review(approve: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("admin_review_payment", {
      p_payment_id: payment.id,
      p_approve: approve,
      p_amount_idr: approve ? Number(amount) : payment.amount_idr,
      p_note: note,
    });
    setBusy(false);
    if (error) return setError(error.message);
    onReviewed();
  }

  const order = payment.orders;
  const customer = order?.customers;

  return (
    <article className={`grid gap-5 rounded-lg border border-border bg-surface p-4 ${pending ? "md:grid-cols-[180px_1fr]" : "md:grid-cols-[96px_1fr]"}`}>
      <div>
        {!payment.proof_url ? (
          <div className="flex aspect-[3/4] items-center justify-center rounded-md bg-surface-sunken p-2 text-center text-xs text-ink-faint">
            {payment.proof_purged_at ? `Diarsipkan ${formatDateID(payment.proof_purged_at)}` : "Tanpa file"}
          </div>
        ) : !proofUrl ? (
          <div className="aspect-[3/4] animate-pulse rounded-md bg-surface-sunken" />
        ) : proofUrl === "missing" ? (
          <div className="flex aspect-[3/4] items-center justify-center rounded-md bg-danger-soft p-2 text-center text-xs text-danger">
            File tidak ditemukan di storage
          </div>
        ) : isPdf ? (
          <a
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex aspect-[3/4] items-center justify-center rounded-md border border-border bg-surface-sunken text-sm font-semibold text-primary"
          >
            Buka PDF
          </a>
        ) : (
          <a href={proofUrl} target="_blank" rel="noopener noreferrer" title="Buka ukuran penuh">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL privat, tanpa optimizer */}
            <img src={proofUrl} alt={`Bukti transfer ${order?.order_code}`} className="aspect-[3/4] w-full rounded-md border border-border object-cover object-top" />
          </a>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link href={`/admin/orders/detail?id=${order?.id}`} className="font-display text-lg font-semibold text-primary hover:underline">
              {order?.order_code}
            </Link>
            <p className="text-sm text-ink-muted">
              {customer?.full_name} · {customer?.code} · {customer?.whatsapp}
            </p>
          </div>
          {!pending && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${payment.status === "verified" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
              {REVIEW_STATUS_LABEL[payment.status]}
            </span>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-muted">Diklaim</dt>
            <dd className="font-semibold tabular-nums">{formatIDR(payment.amount_idr)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Tgl transfer</dt>
            <dd>{payment.paid_at ? formatDateID(payment.paid_at) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Total order</dt>
            <dd className="tabular-nums">{formatIDR(order?.total_idr)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Sisa (terverifikasi)</dt>
            <dd className="flex items-center gap-1.5 tabular-nums">
              {formatIDR(balance?.balance_idr)}
              {balance?.payment_state && <StatusChip kind="payment" status={balance.payment_state} />}
            </dd>
          </div>
        </dl>

        {payment.notes && <p className="mt-3 rounded-md bg-surface-sunken p-2 text-sm">Catatan: {payment.notes}</p>}
        <p className="mt-2 text-xs text-ink-faint">Diunggah {formatDateID(payment.created_at, true)}</p>

        {pending && (
          <div className="mt-4 border-t border-border pt-4">
            {mode === "idle" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs font-medium text-ink-muted">
                  Nominal sesuai mutasi
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 block w-40 rounded-sm border border-border px-3 py-2 text-sm tabular-nums text-ink"
                  />
                </label>
                <button
                  onClick={() => review(true)}
                  disabled={busy}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                >
                  {busy ? "Menyimpan…" : `Verifikasi ${formatIDR(Number(amount) || 0)}`}
                </button>
                <button
                  onClick={() => setMode("reject")}
                  className="rounded-md border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-soft"
                >
                  Tolak
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-ink-muted">
                  Alasan penolakan (tampil ke customer di Lacak Order)
                  <input
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="mis. nominal tidak masuk ke rekening"
                    className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-sm text-ink"
                  />
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setMode("idle")} className="rounded-md border border-border px-4 py-2 text-sm font-semibold">
                    Batal
                  </button>
                  <button
                    onClick={() => review(false)}
                    disabled={busy || !note.trim()}
                    className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Ya, tolak bukti ini
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        )}
      </div>
    </article>
  );
}
