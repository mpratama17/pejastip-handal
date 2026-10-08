"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Pagination, usePagination } from "@/components/pagination";
import { formatIDR, formatDateID } from "@/lib/format";
import { isShopeeCourier, shopeeRefund, useSiteSettings } from "@/lib/site-settings";
import { ExportButton, fetchAll, phone, type Sheet } from "@/components/admin/export-button";
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

  const { pageRows, pagination } = usePagination(rows ?? []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-ink">Pengiriman</h1>
        <ExportButton fileName="pengiriman" build={buildShipmentsExport} />
      </div>

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
        <>
          {/* Satu baris per pengiriman; alamat + isian resi dibuka per baris. */}
          <div className="mt-6 overflow-x-auto rounded-lg border border-ink bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-ink bg-surface-sunken text-left">
                <tr>
                  <th className="py-2.5 pl-3 pr-3 font-semibold">Diajukan</th>
                  <th className="py-2.5 pr-3 font-semibold">Customer</th>
                  <th className="py-2.5 pr-3 font-semibold">Kurir</th>
                  <th className="py-2.5 pr-3 font-semibold">Buku</th>
                  <th className="py-2.5 pr-3 font-semibold">Resi</th>
                  <th className="py-2.5 pr-3 font-semibold">
                    <span className="sr-only">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <ShipmentRows key={s.id} shipment={s} onSaved={load} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} unit="pengiriman" />
        </>
      )}
    </div>
  );
}

function ShipmentRows({ shipment: s, onSaved }: { shipment: ShipmentRow; onSaved: () => void }) {
  const [tracking, setTracking] = useState(s.tracking_number ?? "");
  const [cost, setCost] = useState(s.shipping_cost_idr?.toString() ?? "");
  const [service, setService] = useState(s.service ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const settings = useSiteSettings();
  // Via Shopee: ongkir dibayar customer di Shopee, admin tinggal mengembalikan nominal checkout.
  const viaShopee = isShopeeCourier(s.courier);

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

  const bookCount = s.order_items.reduce((a, it) => a + it.qty, 0);

  return (
    <Fragment>
      <tr className={`border-t-1 border-line align-top first:border-0 ${open ? "bg-primary-soft" : ""}`}>
        <td className="whitespace-nowrap py-2.5 pl-3 pr-3 text-ink-muted">{formatDateID(s.created_at)}</td>
        <td className="py-2.5 pr-3">
          <p className="font-semibold">{s.customers?.full_name}</p>
          <p className="text-xs text-ink-muted">
            {s.customers?.code} · {s.customers?.whatsapp}
          </p>
        </td>
        <td className="py-2.5 pr-3">
          <span className="whitespace-nowrap rounded-full border border-ink bg-surface px-2.5 py-1 text-xs font-semibold text-ink">{s.courier}</span>
        </td>
        <td className="py-2.5 pr-3">
          {bookCount} buku
          <span className="block text-xs text-ink-faint">
            {[...new Set(s.order_items.map((it) => it.orders?.order_code))].join(", ")}
          </span>
        </td>
        <td className="py-2.5 pr-3 tabular-nums">
          {s.tracking_number ?? <span className="text-ink-faint">—</span>}
          {s.delivered_at && <span className="block text-xs text-success">diterima {formatDateID(s.delivered_at)}</span>}
        </td>
        <td className="py-2.5 pr-3 text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`btn press whitespace-nowrap px-3 py-1.5 text-xs font-semibold ${s.tracking_number ? "btn-secondary" : "btn-primary"}`}
          >
            {open ? "Tutup" : s.delivered_at ? "Detail" : s.tracking_number ? "Ubah" : "Proses"}
          </button>
        </td>
      </tr>

      {open && (
        <tr className="bg-primary-soft/40">
          <td colSpan={6} className="px-3 pb-4 pt-1">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="flex items-start justify-between gap-3 rounded-md bg-surface-sunken p-3 text-sm">
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

                {viaShopee && settings && settings.shopee_checkout.nominal_idr > 0 && (
                  <p className="mt-3 rounded-md border border-ink bg-sky-soft p-3 text-sm">
                    Checkout Shopee {formatIDR(settings.shopee_checkout.nominal_idr)}. Setelah pesanan Shopee selesai, refund{" "}
                    <b className="tabular-nums">{formatIDR(shopeeRefund(settings.shopee_checkout))}</b> ke customer (tanya rekening via WA).
                  </p>
                )}
              </div>

              <div>
                <ul className="flex flex-col gap-1 text-sm">
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
                    Resi <span className="font-semibold tabular-nums text-ink">{s.tracking_number}</span>
                    {!viaShopee && ` · ongkir ${formatIDR(s.shipping_cost_idr)}`} · diterima {formatDateID(s.delivered_at)}
                  </p>
                ) : (
                  <div className="mt-4 border-t-1 border-line pt-3">
                    <div className={`grid gap-2 ${viaShopee ? "grid-cols-[1fr_5rem]" : "grid-cols-[1fr_7rem_5rem]"}`}>
                      <label className="text-xs font-medium text-ink-muted">
                        No. resi
                        <input value={tracking} onChange={(e) => setTracking(e.target.value)} className="mt-1 w-full rounded-sm border border-border px-2 py-1.5 text-sm tabular-nums text-ink" />
                      </label>
                      {!viaShopee && (
                        <label className="text-xs font-medium text-ink-muted">
                          Ongkir (Rp)
                          <input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} className="mt-1 w-full rounded-sm border border-border px-2 py-1.5 text-sm tabular-nums text-ink" />
                        </label>
                      )}
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
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// Semua pengiriman, tidak ikut tab.
async function buildShipmentsExport(): Promise<Sheet[]> {
  const rows = await fetchAll<ShipmentRow>((a, b) =>
    supabase
      .from("shipments")
      .select("*, customers(full_name, code, whatsapp), order_items(id, qty, orders(order_code), event_items(books(title)))")
      .order("created_at", { ascending: false }).order("id")
      .range(a, b),
  );
  return [
    {
      name: "Pengiriman",
      header: ["Diajukan", "Status", "Customer", "Kode", "WhatsApp", "Penerima", "HP Penerima", "Kurir", "Layanan", "Resi", "Ongkir", "Alamat", "Detail Alamat", "Kota", "Provinsi", "Kode Pos", "Dikirim", "Diterima", "Buku"],
      rows: rows.map((s) => [
        new Date(s.created_at),
        s.delivered_at ? "Diterima" : s.tracking_number ? "Dalam pengiriman" : "Perlu resi",
        s.customers?.full_name ?? null, s.customers?.code ?? null, phone(s.customers?.whatsapp),
        s.recipient_name, phone(s.recipient_phone), s.courier, s.service, s.tracking_number, s.shipping_cost_idr,
        s.address_street, s.address_detail, s.city, s.province, s.postal_code,
        s.shipped_at ? new Date(s.shipped_at) : null, s.delivered_at ? new Date(s.delivered_at) : null,
        s.order_items.map((i) => `${i.event_items?.books?.title ?? "?"} ×${i.qty} (${i.orders?.order_code ?? "?"})`).join("; "),
      ]),
    },
  ];
}
