"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { StatusChip } from "@/components/status-chip";
import { formatIDR, formatDateID } from "@/lib/format";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  customers: Database["public"]["Tables"]["customers"]["Row"] | null;
  events: Database["public"]["Tables"]["events"]["Row"] | null;
};
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"] & {
  event_items: { books: Database["public"]["Tables"]["books"]["Row"] } | null;
};
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type PaymentState = Database["public"]["Views"]["v_order_payment"]["Row"];

export default function AdminOrderDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Memuat…</p>}>
      <OrderDetail />
    </Suspense>
  );
}

function OrderDetail() {
  const id = useSearchParams().get("id");
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentState, setPaymentState] = useState<PaymentState | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [discount, setDiscount] = useState({ amount: "0", note: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!id) return;
    const [orderRes, itemsRes, paymentsRes, stateRes] = await Promise.all([
      supabase.from("orders").select("*, customers(*), events(*)").eq("id", id).single(),
      supabase.from("order_items").select("*, event_items(books(*))").eq("order_id", id),
      supabase.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false }),
      supabase.from("v_order_payment").select("*").eq("order_id", id).single(),
    ]);
    const o = orderRes.data as unknown as OrderRow | null;
    setOrder(o);
    setItems((itemsRes.data as unknown as OrderItemRow[]) ?? []);
    setPayments(paymentsRes.data ?? []);
    setPaymentState(stateRes.data ?? null);
    if (o) {
      setAdminNotes(o.admin_notes ?? "");
      setDiscount({ amount: String(o.discount_idr), note: o.discount_note ?? "" });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveNotes() {
    if (!order) return;
    setSaving(true);
    await supabase
      .from("orders")
      .update({
        admin_notes: adminNotes || null,
        discount_idr: Number(discount.amount) || 0,
        discount_note: discount.note || null,
      })
      .eq("id", order.id);
    setSaving(false);
    load();
  }

  async function handleCancel() {
    if (!order) return;
    const verifiedPaid = payments
      .filter((p) => p.status === "verified")
      .reduce((sum, p) => sum + p.amount_idr, 0);
    const consequence =
      verifiedPaid > 0
        ? ` Pembayaran terverifikasi ${formatIDR(verifiedPaid)} akan menjadi kredit yang harus diselesaikan manual.`
        : "";
    const ok = window.confirm(
      `Batalkan ${order.order_code} milik ${order.customers?.full_name}?${consequence}`,
    );
    if (!ok) return;
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    load();
  }

  if (!id) return <p className="text-sm text-danger">ID order tidak ada di URL.</p>;
  if (!order) return <p className="text-sm text-ink-muted">Memuat…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">{order.order_code}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {order.customers?.full_name} ({order.customers?.code}) · {order.events?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip kind="order" status={order.status} />
          {paymentState && <StatusChip kind="payment" status={paymentState.payment_state ?? "not_paid"} />}
        </div>
      </div>

      {order.status !== "cancelled" && (
        <button
          onClick={handleCancel}
          className="mt-4 rounded-md border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-soft"
        >
          Batalkan Order
        </button>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total" value={formatIDR(order.total_idr)} />
        <SummaryCard label="Terbayar" value={formatIDR(paymentState?.paid_idr ?? 0)} />
        <SummaryCard label="Sisa tagihan" value={formatIDR(paymentState?.balance_idr ?? 0)} accent />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Buku</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Judul</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Harga</th>
                <th className="px-4 py-2 font-medium">Status Kirim</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-4 py-2 text-ink">{it.event_items?.books?.title ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.qty}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatIDR(it.unit_price_idr)}</td>
                  <td className="px-4 py-2">
                    <StatusChip kind="shipping" status={it.shipping_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Pembayaran</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Tanggal</th>
                <th className="px-4 py-2 text-right font-medium">Nominal</th>
                <th className="px-4 py-2 font-medium">Metode</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2 text-ink-muted">{p.paid_at ?? formatDateID(p.created_at)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatIDR(p.amount_idr)}</td>
                  <td className="px-4 py-2 text-ink-muted">{p.method}</td>
                  <td className="px-4 py-2 capitalize">{p.status}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-faint">
                    Belum ada bukti pembayaran masuk.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 max-w-lg rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Diskon &amp; catatan admin</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-ink-muted">Diskon (Rp)</label>
            <input
              type="number"
              min={0}
              value={discount.amount}
              onChange={(e) => setDiscount({ ...discount, amount: e.target.value })}
              className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted">Alasan diskon</label>
            <input
              value={discount.note}
              onChange={(e) => setDiscount({ ...discount, note: e.target.value })}
              placeholder="mis. member lama"
              className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <label className="mt-3 block text-xs font-medium text-ink-muted">Catatan admin (tampil di tracker)</label>
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm"
        />
        <button
          onClick={handleSaveNotes}
          disabled={saving}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${accent ? "text-accent" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}
