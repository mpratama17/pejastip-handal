"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatIDR, formatDateID } from "@/lib/format";
import type { Database } from "@/types/database";

type ShipmentRow = Database["public"]["Tables"]["shipments"]["Row"] & {
  customers: { full_name: string; code: string; whatsapp: string } | null;
  order_items: {
    id: string;
    qty: number;
    orders: { order_code: string } | null;
    event_items: { books: { title: string } | null } | null;
  }[];
};
type Tab = "needs_tracking" | "in_transit" | "delivered";

const TABS: { key: Tab; label: string }[] = [
  { key: "needs_tracking", label: "Perlu resi" },
  { key: "in_transit", label: "Dalam pengiriman" },
  { key: "delivered", label: "Diterima" },
];

export default function AdminShipmentsPage() {
  const [tab, setTab] = useState<Tab>("needs_tracking");
  const [rows, setRows] = useState<ShipmentRow[] | null>(null);

  const load = useCallback(async () => {
    let q = supabase
      .from("shipments")
      .select("*, customers(full_name, code, whatsapp), order_items(id, qty, orders(order_code), event_items(books(title)))")
      .order("created_at", { ascending: tab === "needs_tracking" })
      .limit(100);
    if (tab === "needs_tracking") q = q.is("tracking_number", null);
    if (tab === "in_transit") q = q.not("tracking_number", "is", null).is("delivered_at", null);
    if (tab === "delivered") q = q.not("delivered_at", "is", null);
    const { data } = await q;
    setRows((data as unknown as ShipmentRow[]) ?? []);
  }, [tab]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-ink">Pengiriman</h1>

      <div className="mt-4 flex gap-1 rounded-md bg-surface-sunken p-1 text-sm sm:inline-flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 whitespace-nowrap rounded-full px-4 py-1.5 font-semibold ${tab === t.key ? "border border-ink bg-primary text-ink" : "border border-transparent text-ink-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-ink-muted">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-surface p-8 text-center text-sm text-ink-muted">
          Tidak ada pengiriman di tab ini.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {rows.map((s) => (
            <ShipmentCard key={s.id} shipment={s} onSaved={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShipmentCard({ shipment: s, onSaved }: { shipment: ShipmentRow; onSaved: () => void }) {
  const [tracking, setTracking] = useState(s.tracking_number ?? "");
  const [cost, setCost] = useState(s.shipping_cost_idr?.toString() ?? "");
  const [service, setService] = useState(s.service ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const addressText = [
    s.recipient_name,
    s.recipient_phone,
    [s.address_street, s.address_detail].filter(Boolean).join(", "),
    `${s.city}, ${s.province} ${s.postal_code}`,
  ]
    .filter(Boolean)
    .join("\n");

  async function save(markDelivered: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("admin_update_shipment", {
      p_shipment_id: s.id,
      p_tracking_number: tracking,
      p_shipping_cost_idr: cost === "" ? (null as unknown as number) : Number(cost),
      p_service: service,
      p_mark_delivered: markDelivered,
    });
    setBusy(false);
    if (error) return setError(error.message);
    onSaved();
  }

  return (
    <article className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{s.customers?.full_name}</p>
          <p className="text-xs text-ink-muted">
            {s.customers?.code} · {s.customers?.whatsapp} · diajukan {formatDateID(s.created_at)}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-ink">{s.courier}</span>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3 rounded-md bg-surface-sunken p-3 text-sm">
        <p className="whitespace-pre-line">{addressText}</p>
        <button
          onClick={() =>
            navigator.clipboard.writeText(addressText).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
          className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold"
        >
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {s.order_items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2">
            <span>
              {it.event_items?.books?.title} <span className="text-ink-muted">× {it.qty}</span>
            </span>
            <span className="text-xs text-ink-faint">{it.orders?.order_code}</span>
          </li>
        ))}
      </ul>

      {s.delivered_at ? (
        <p className="mt-4 border-t-1 border-line pt-3 text-sm text-ink-muted">
          Resi <span className="font-semibold tabular-nums text-ink">{s.tracking_number}</span> · ongkir{" "}
          {formatIDR(s.shipping_cost_idr)} · diterima {formatDateID(s.delivered_at)}
        </p>
      ) : (
        <div className="mt-4 border-t-1 border-line pt-3">
          <div className="grid grid-cols-[1fr_7rem_5rem] gap-2">
            <label className="text-xs font-medium text-ink-muted">
              No. resi
              <input value={tracking} onChange={(e) => setTracking(e.target.value)} className="mt-1 w-full rounded-sm border border-border px-2 py-1.5 text-sm tabular-nums text-ink" />
            </label>
            <label className="text-xs font-medium text-ink-muted">
              Ongkir (Rp)
              <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className="mt-1 w-full rounded-sm border border-border px-2 py-1.5 text-sm tabular-nums text-ink" />
            </label>
            <label className="text-xs font-medium text-ink-muted">
              Layanan
              <input value={service} onChange={(e) => setService(e.target.value)} placeholder="REG" className="mt-1 w-full rounded-sm border border-border px-2 py-1.5 text-sm text-ink" />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => save(false)} disabled={busy} className="btn btn-primary press px-4 py-2 text-sm font-semibold disabled:opacity-60">
              {s.tracking_number ? "Simpan" : "Simpan Resi"}
            </button>
            {s.tracking_number && (
              <button onClick={() => save(true)} disabled={busy} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-sunken disabled:opacity-60">
                Tandai Diterima
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
