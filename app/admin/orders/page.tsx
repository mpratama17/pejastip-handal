"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { StatusChip } from "@/components/status-chip";
import { formatIDR, formatDateID } from "@/lib/format";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type PaymentState = Database["public"]["Views"]["v_order_payment"]["Row"];

type OrderRow = Database["public"]["Tables"]["orders"]["Row"] & {
  customers: { full_name: string; code: string } | null;
  events: { name: string } | null;
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [paymentStates, setPaymentStates] = useState<Record<string, PaymentState>>({});
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventFilter, setEventFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [ordersRes, paymentRes, eventsRes] = await Promise.all([
        supabase
          .from("orders")
          .select("*, customers(full_name, code), events(name)")
          .order("created_at", { ascending: false }),
        supabase.from("v_order_payment").select("*"),
        supabase.from("events").select("*").order("created_at", { ascending: false }),
      ]);
      setOrders((ordersRes.data as unknown as OrderRow[]) ?? []);
      const map: Record<string, PaymentState> = {};
      for (const row of paymentRes.data ?? []) {
        if (row.order_id) map[row.order_id] = row;
      }
      setPaymentStates(map);
      setEvents(eventsRes.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (eventFilter && o.event_id !== eventFilter) return false;
      if (paymentFilter && paymentStates[o.id]?.payment_state !== paymentFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${o.order_code} ${o.customers?.full_name ?? ""} ${o.customers?.code ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, eventFilter, paymentFilter, search, paymentStates]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Order</h1>
        <Link href="/admin/orders/new" className="btn btn-primary press px-4 py-2 text-sm font-semibold">
          + Order Manual
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          placeholder="Cari nama, kode customer, atau order_code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-sm border border-border px-3 py-2 text-sm"
        />
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="rounded-sm border border-border px-3 py-2 text-sm"
        >
          <option value="">Semua event</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="rounded-sm border border-border px-3 py-2 text-sm"
        >
          <option value="">Semua status bayar</option>
          <option value="not_paid">Belum Bayar</option>
          <option value="partially_paid">DP Diterima</option>
          <option value="fully_paid">Lunas</option>
          <option value="overpaid">Lebih Bayar</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Kode</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-4 py-2 font-medium">Status Bayar</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const ps = paymentStates[o.id];
              return (
                <tr key={o.id} className="border-t-1 border-line">
                  <td className="px-4 py-2">
                    <Link href={`/admin/orders/detail?id=${o.id}`} className="font-medium text-link hover:underline">
                      {o.order_code}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink">
                    {o.customers?.full_name ?? "—"}
                    <span className="ml-1 text-ink-faint">({o.customers?.code})</span>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{o.events?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    {ps ? <StatusChip kind="payment" status={ps.payment_state ?? "not_paid"} /> : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">{formatIDR(o.total_idr)}</td>
                  <td className="px-4 py-2 text-ink-muted">{formatDateID(o.created_at)}</td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                  Tidak ada order yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
