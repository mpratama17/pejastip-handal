"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { StatusChip, SHIPPING_STATUS_MAP } from "@/components/status-chip";
import { formatIDR, formatDateID } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
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
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
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
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function deleteManualPayment(p: PaymentRow) {
    const ok = await confirm({
      title: "Hapus pembayaran ini?",
      body: `${formatIDR(p.amount_idr)} · ${PAYMENT_METHOD_LABEL[p.method] ?? p.method}\n\nStatus bayar order akan dihitung ulang.`,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    setPaymentError(null);
    const { error } = await supabase.rpc("admin_delete_manual_payment", { p_payment_id: p.id });
    if (error) return setPaymentError(error.message);
    load();
  }

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
          <h1 className="font-display text-xl font-bold text-ink">{order.order_code}</h1>
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

      <RefundPanel order={order} paymentState={paymentState} onChanged={load} />

      <ItemsSection order={order} items={items} onChanged={load} />

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-ink">Pembayaran</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-ink bg-surface-sunken text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Tanggal</th>
                <th className="px-4 py-2 text-right font-medium">Nominal</th>
                <th className="px-4 py-2 font-medium">Metode</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t-1 border-line">
                  <td className="px-4 py-2 text-ink-muted">{p.paid_at ?? formatDateID(p.created_at)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatIDR(p.amount_idr)}</td>
                  <td className="px-4 py-2 text-ink-muted">
                    {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                    {p.proof_url === null && <span className="ml-1 text-xs text-ink-faint">(dicatat manual)</span>}
                  </td>
                  <td className="px-4 py-2 capitalize">{p.status}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {/* Bukti unggahan customer tidak boleh dihapus diam-diam —
                        itu lewat alur verifikasi/tolak di halaman Pembayaran. */}
                    {p.proof_url === null ? (
                      <button
                        onClick={() => deleteManualPayment(p)}
                        className="text-sm font-semibold text-danger hover:underline"
                      >
                        Hapus
                      </button>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-faint">
                    Belum ada pembayaran tercatat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {paymentError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {paymentError}
          </p>
        )}
        <RecordPaymentForm orderId={order.id} balance={paymentState?.balance_idr ?? 0} onSaved={load} onError={setPaymentError} />
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

// Status bayar tidak disimpan — dihitung dari pembayaran terverifikasi
// (v_order_payment). Jadi yang dicatat pembayarannya; chip Belum Bayar /
// DP Diterima / Lunas ikut berubah sendiri.
function RecordPaymentForm({
  orderId,
  balance,
  onSaved,
  onError,
}: {
  orderId: string;
  balance: number;
  onSaved: () => void;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const amountNum = Number(amount);
  const valid = Number.isInteger(amountNum) && amountNum > 0;

  async function save() {
    if (!valid) return;
    setSaving(true);
    onError(null);
    const { error } = await supabase.rpc("admin_record_payment", {
      p_order_id: orderId,
      p_amount_idr: amountNum,
      p_method: method,
      p_paid_at: paidAt,
      p_note: note.trim(),
    });
    setSaving(false);
    if (error) return onError(error.message);
    setAmount("");
    setNote("");
    setOpen(false);
    onSaved();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary press mt-3 px-4 py-2 text-sm font-semibold">
        + Catat pembayaran
      </button>
    );
  }

  return (
    <div className="mt-3 max-w-2xl rounded-lg border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold text-ink">Catat pembayaran manual</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Untuk transfer yang sudah kamu lihat sendiri di mutasi rekening, tanpa customer mengunggah bukti.
        {balance > 0 && <> Sisa tagihan sekarang {formatIDR(balance)}.</>}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-ink">
          Nominal (Rp)
          <input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm tabular-nums"
          />
        </label>
        <label className="block text-xs font-semibold text-ink">
          Metode
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
          >
            {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-ink">
          Tanggal transfer
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-ink sm:col-span-3">
          Catatan <span className="font-normal text-ink-faint">(opsional)</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="mis. transfer dari rekening istri"
            className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {balance > 0 && valid && amountNum !== balance && (
        <p className="mt-2 text-xs text-ink-muted">
          {amountNum < balance
            ? `Sisa tagihan jadi ${formatIDR(balance - amountNum)} — status akan "DP Diterima".`
            : `Lebih ${formatIDR(amountNum - balance)} dari sisa tagihan.`}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={!valid || saving}
          className="btn btn-primary press px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {saving ? "Menyimpan…" : "Simpan pembayaran"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            onError(null);
          }}
          className="text-sm font-semibold text-ink-muted hover:underline"
        >
          Batal
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold tabular-nums ${accent ? "text-accent-ink" : "text-ink"}`}>
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
  // Status kirim tidak lagi tersimpan begitu dropdown berubah. Tanpa tombol,
  // admin tidak punya cara tahu apakah perubahannya masuk — datanya benar,
  // tapi keyakinannya hilang. Draft per baris; tombol Simpan cuma muncul kalau
  // nilainya memang beda dari yang tersimpan.
  const [draftStatus, setDraftStatus] = useState<Record<string, ItemStatus>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
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

  async function saveStatus(itemId: string) {
    const status = draftStatus[itemId];
    if (!status) return;
    setError(null);
    setSavedId(null);
    setSavingId(itemId);
    const { error } = await supabase.rpc("admin_set_item_status", { p_item_id: itemId, p_status: status });
    setSavingId(null);
    if (error) return setError(error.message);
    setDraftStatus((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setSavedId(itemId);
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
            <thead className="border-b border-ink bg-surface-sunken text-left">
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
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Status kirim ${titleOf(it)}`}
                          value={draftStatus[it.id] ?? it.shipping_status}
                          onChange={(e) => {
                            setSavedId(null);
                            setDraftStatus((prev) => ({ ...prev, [it.id]: e.target.value as ItemStatus }));
                          }}
                          className="rounded-sm border border-border bg-surface px-2 py-1 text-sm"
                        >
                          {OVERRIDE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {SHIPPING_STATUS_MAP[s].label}
                            </option>
                          ))}
                        </select>
                        {draftStatus[it.id] && draftStatus[it.id] !== it.shipping_status && (
                          <button
                            type="button"
                            onClick={() => saveStatus(it.id)}
                            disabled={savingId === it.id}
                            className="btn btn-primary press px-3 py-1 text-xs font-semibold disabled:opacity-60"
                          >
                            {savingId === it.id ? "Menyimpan…" : "Simpan"}
                          </button>
                        )}
                        {savedId === it.id && (
                          <span role="status" className="text-xs font-medium text-success">
                            Tersimpan
                          </span>
                        )}
                      </div>
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


// Kelebihan bayar dikembalikan admin di luar aplikasi; yang dicatat di sini cuma
// faktanya. Begitu tercatat, v_order_payment menghitung dari pembayaran bersih,
// jadi chip berhenti bilang "Lebih Bayar" dan tracker customer ikut benar.
function RefundPanel({
  order,
  paymentState,
  onChanged,
}: {
  order: OrderRow;
  paymentState: PaymentState | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [refundedAt, setRefundedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  const sudahDikembalikan = order.refund_amount_idr ?? 0;
  const lebih = Math.max((paymentState?.paid_idr ?? 0) - (order.total_idr ?? 0), 0);

  // Tidak ada kelebihan dan belum pernah ada pengembalian: tidak usah tampil.
  if (lebih === 0 && sudahDikembalikan === 0) return null;

  async function save() {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) return setError("Nominal pengembalian harus angka bulat lebih dari 0.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("admin_record_refund", {
      p_order_id: order.id,
      p_amount_idr: n,
      p_refunded_at: refundedAt,
      p_note: note.trim(),
    });
    setBusy(false);
    if (error) return setError(error.message);
    setOpen(false);
    setAmount("");
    setNote("");
    onChanged();
  }

  async function clear() {
    const ok = await confirm({
      title: "Batalkan catatan pengembalian?",
      body: `Catatan pengembalian ${formatIDR(sudahDikembalikan)} akan dihapus dan status bayar dihitung ulang.\n\nUangnya sendiri tidak ikut kembali — ini cuma pencatatan.`,
      confirmLabel: "Batalkan catatan",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("admin_clear_refund", { p_order_id: order.id });
    setBusy(false);
    if (error) return setError(error.message);
    onChanged();
  }

  if (sudahDikembalikan > 0) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-ink">
          Kelebihan bayar sudah dikembalikan: {formatIDR(sudahDikembalikan)}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {order.refunded_at ? `Dikembalikan ${formatDateID(order.refunded_at)}. ` : ""}
          Total transfer masuk {formatIDR(paymentState?.gross_paid_idr ?? 0)}, terhitung terbayar{" "}
          {formatIDR(paymentState?.paid_idr ?? 0)}.
          {order.refund_note ? ` Catatan: ${order.refund_note}` : ""}
        </p>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        <button
          onClick={clear}
          disabled={busy}
          className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-surface-sunken disabled:opacity-60"
        >
          Batalkan catatan
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border-2 border-ink bg-info-soft p-4 shadow-hard">
      <p className="font-display text-sm font-bold text-ink">Customer kelebihan bayar {formatIDR(lebih)}</p>
      <p className="mt-1 text-xs text-ink-muted">
        Kembalikan uangnya lewat transfer seperti biasa, lalu catat di sini supaya status bayarnya berhenti
        bilang Lebih Bayar.
      </p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      {!open ? (
        <button
          onClick={() => {
            setAmount(String(lebih));
            setOpen(true);
          }}
          className="btn btn-primary press mt-3 px-4 py-2 text-sm font-semibold"
        >
          Catat pengembalian
        </button>
      ) : (
        <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold text-ink">
            Nominal (Rp)
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm tabular-nums"
            />
          </label>
          <label className="block text-xs font-semibold text-ink">
            Tanggal dikembalikan
            <input
              type="date"
              value={refundedAt}
              onChange={(e) => setRefundedAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-ink">
            Catatan (opsional)
            <input
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. transfer balik BCA"
              className="mt-1 w-full rounded-md border border-border px-2 py-1.5 text-sm font-normal"
            />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button onClick={save} disabled={busy} className="btn btn-primary press px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
            <button onClick={() => setOpen(false)} className="btn btn-secondary press px-4 py-2 text-sm">
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
