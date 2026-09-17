"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { StatusChip, SHIPPING_STATUS_MAP } from "@/components/status-chip";
import { formatIDR, formatDateID } from "@/lib/format";
import { waLink } from "@/lib/site-settings";
import type { Database } from "@/types/database";

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  customers: Database["public"]["Tables"]["customers"]["Row"] | null;
  events: Database["public"]["Tables"]["events"]["Row"] | null;
};
type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"] & {
  event_items: { books: Database["public"]["Tables"]["books"]["Row"] } | null;
};
type ItemStatus = Database["public"]["Enums"]["item_shipping_status"];
type CatalogItem = {
  id: string;
  price_idr: number;
  stock: number | null;
  is_active: boolean;
  books: { title: string; author: string | null } | null;
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
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

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
    setNotesError(null);
    const { error } = await supabase
      .from("orders")
      .update({
        admin_notes: adminNotes || null,
        discount_idr: Number(discount.amount) || 0,
        discount_note: discount.note || null,
      })
      .eq("id", order.id);
    setSaving(false);
    if (error) {
      return setNotesError(
        error.message.includes("orders_discount_le_subtotal") ? "Diskon tidak boleh melebihi subtotal." : `Gagal menyimpan: ${error.message}`,
      );
    }
    load();
  }

  async function handleCancel() {
    if (!order) return;
    const verifiedPaid = payments
      .filter((p) => p.status === "verified")
      .reduce((sum, p) => sum + p.amount_idr, 0);
    const ok = await confirm({
      title: `Batalkan ${order.order_code}?`,
      body:
        `Order milik ${order.customers?.full_name} tidak bisa diaktifkan lagi.` +
        (verifiedPaid > 0
          ? `\n\nPembayaran terverifikasi ${formatIDR(verifiedPaid)} menjadi kredit yang harus diselesaikan manual.`
          : ""),
      confirmLabel: "Batalkan order",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    if (error) return setError(`Gagal membatalkan: ${error.message}`);
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
          {order.customers && (
            <button
              type="button"
              onClick={() => {
                const c = order.customers!;
                const text = `Halo ${c.full_name}, order ${order.order_code} sudah kami catat. Kode pelacakanmu: ${c.code}. Cek status & upload bukti transfer di ${window.location.origin}/track?code=${c.code}`;
                window.open(waLink(c.whatsapp, text), "_blank", "noopener");
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-sunken"
            >
              Kirim kode via WA
            </button>
          )}
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

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Total" value={formatIDR(order.total_idr)} />
        <SummaryCard label="Terbayar" value={formatIDR(paymentState?.paid_idr ?? 0)} />
        <SummaryCard label="Sisa tagihan" value={formatIDR(paymentState?.balance_idr ?? 0)} accent />
      </div>

      <ItemsSection order={order} items={items} onChanged={load} />

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
                <tr key={p.id} className="border-t-1 border-line">
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
          className="btn btn-primary press mt-3 px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        {notesError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {notesError}
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold tabular-nums ${accent ? "text-accent-ink" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

// Buku yang sudah jalan ke customer (masuk shipment) atau sudah bergerak dari
// status awal tidak bisa diedit — sama dengan aturan di admin_update_order_items.
const isEditable = (it: OrderItemRow) => it.shipment_id === null && it.shipping_status === "not_shipped";
const OVERRIDE_STATUSES: ItemStatus[] = ["not_shipped", "shipped_to_indo", "arrived_in_indo"];

function ItemsSection({ order, items, onChanged }: { order: OrderRow; items: OrderItemRow[]; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ event_item_id: string; qty: number }[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = order.status !== "cancelled" && order.status !== "completed";
  const locked = items.filter((it) => !isEditable(it));
  const lockedIds = new Set(locked.map((it) => it.event_item_id));
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const oldPrice = new Map(items.map((it) => [it.event_item_id, it.unit_price_idr]));
  const priceOf = (eventItemId: string) => oldPrice.get(eventItemId) ?? byId.get(eventItemId)?.price_idr ?? 0;
  const draftIds = new Set(draft.map((d) => d.event_item_id));
  const addable = catalog.filter((c) => c.is_active && !draftIds.has(c.id) && !lockedIds.has(c.id));
  const newSubtotal =
    locked.reduce((sum, it) => sum + it.qty * it.unit_price_idr, 0) +
    draft.reduce((sum, d) => sum + d.qty * priceOf(d.event_item_id), 0);

  async function startEdit() {
    setError(null);
    setDraft(items.filter(isEditable).map((it) => ({ event_item_id: it.event_item_id, qty: it.qty })));
    setEditing(true);
    const { data, error } = await supabase
      .from("event_items")
      .select("id, price_idr, stock, is_active, books(title, author)")
      .eq("event_id", order.event_id);
    if (error) return setError("Katalog batch gagal dimuat.");
    const list = (data as unknown as CatalogItem[]) ?? [];
    list.sort((a, b) => (a.books?.title ?? "").localeCompare(b.books?.title ?? ""));
    setCatalog(list);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("admin_update_order_items", { p_order_id: order.id, p_items: draft });
    setBusy(false);
    if (error) return setError(error.message);
    setEditing(false);
    onChanged();
  }

  async function setStatus(itemId: string, status: ItemStatus) {
    setError(null);
    const { error } = await supabase.rpc("admin_set_item_status", { p_item_id: itemId, p_status: status });
    if (error) return setError(error.message);
    onChanged();
  }

  const titleOf = (it: OrderItemRow) => it.event_items?.books?.title ?? "—";

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Buku</h2>
        {canEdit && !editing && (
          <button onClick={startEdit} className="text-sm font-semibold text-link hover:underline">
            Edit buku
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}

      {!editing ? (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Judul</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Harga</th>
                <th className="px-4 py-2 text-right font-medium">Jumlah</th>
                <th className="px-4 py-2 font-medium">Status kirim</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t-1 border-line">
                  <td className="px-4 py-2 text-ink">{titleOf(it)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.qty}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatIDR(it.unit_price_idr)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatIDR(it.qty * it.unit_price_idr)}</td>
                  <td className="px-4 py-2">
                    {canEdit && it.shipment_id === null && OVERRIDE_STATUSES.includes(it.shipping_status) ? (
                      // R15: satu buku bisa beda status dari batch-nya (mis. tertinggal).
                      <select
                        aria-label={`Status kirim ${titleOf(it)}`}
                        value={it.shipping_status}
                        onChange={(e) => setStatus(it.id, e.target.value as ItemStatus)}
                        className="rounded-sm border border-border bg-surface px-2 py-1 text-sm"
                      >
                        {OVERRIDE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {SHIPPING_STATUS_MAP[s].label}
                          </option>
                        ))}
                      </select>
                    ) : order.status === "cancelled" ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <StatusChip kind="shipping" status={it.shipping_status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-ink bg-surface p-4">
          <ul className="flex flex-col divide-y-1 divide-line">
            {locked.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm text-ink-muted">
                <span className="min-w-0">
                  {titleOf(it)} <span className="tabular-nums">× {it.qty}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <StatusChip kind="shipping" status={it.shipping_status} /> terkunci
                </span>
              </li>
            ))}
            {draft.map((d) => {
              const c = byId.get(d.event_item_id);
              const title = c?.books?.title ?? items.find((it) => it.event_item_id === d.event_item_id)?.event_items?.books?.title ?? "…";
              const setQty = (next: (qty: number) => number) =>
                setDraft((prev) => prev.map((x) => (x.event_item_id === d.event_item_id ? { ...x, qty: Math.max(1, next(x.qty)) } : x)));
              return (
                <li key={d.event_item_id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {title}
                    <span className="ml-2 text-xs tabular-nums text-ink-faint">{formatIDR(priceOf(d.event_item_id))}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <button type="button" aria-label={`Kurangi ${title}`} onClick={() => setQty((q) => q - 1)} className="h-8 w-8 rounded-sm border border-border hover:bg-surface-sunken">
                      −
                    </button>
                    <input
                      aria-label={`Qty ${title}`}
                      type="number"
                      min={1}
                      value={d.qty}
                      onChange={(e) => setQty(() => Number(e.target.value) || 1)}
                      className="h-8 w-14 rounded-sm border border-border text-center tabular-nums"
                    />
                    <button type="button" aria-label={`Tambah ${title}`} onClick={() => setQty((q) => q + 1)} className="h-8 w-8 rounded-sm border border-border hover:bg-surface-sunken">
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => prev.filter((x) => x.event_item_id !== d.event_item_id))}
                      className="ml-2 rounded-sm px-2 py-1 text-sm text-danger hover:bg-danger-soft"
                    >
                      Hapus
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t-1 border-line pt-3">
            <select
              aria-label="Tambah buku dari batch ini"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 py-2 text-sm"
            >
              <option value="">{catalog.length ? "Pilih buku dari batch ini…" : "Memuat katalog…"}</option>
              {addable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.books?.title} — {formatIDR(c.price_idr)}
                  {c.stock !== null ? ` (stok ${c.stock})` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!adding}
              onClick={() => {
                setDraft((prev) => [...prev, { event_item_id: adding, qty: 1 }]);
                setAdding("");
              }}
              className="btn btn-secondary press px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Tambah
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              Subtotal baru <span className="font-semibold tabular-nums text-ink">{formatIDR(newSubtotal)}</span>
              {newSubtotal !== order.subtotal_idr && (
                <span className="ml-1 tabular-nums">(sebelumnya {formatIDR(order.subtotal_idr)})</span>
              )}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-sunken">
                Batal
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || newSubtotal === 0}
                className="btn btn-primary press px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Menyimpan…" : "Simpan perubahan"}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-faint">Buku lama tetap memakai harga saat order; buku baru memakai harga batch sekarang.</p>
        </div>
      )}
    </div>
  );
}
