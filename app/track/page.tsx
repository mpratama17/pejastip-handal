"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { StatusChip } from "@/components/status-chip";
import { formatIDR, formatDateID } from "@/lib/format";
import type { Database } from "@/types/database";

type TrackerRow = Database["public"]["Functions"]["get_tracker"]["Returns"][number];
type TrackerItem = { title: string; qty: number; shipping_status: string };

export default function TrackPage() {
  const [code, setCode] = useState("");
  const [orders, setOrders] = useState<TrackerRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleTrack(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setOrders(null);
    const { data, error } = await supabase.rpc("get_tracker", { p_code: code.trim().toUpperCase() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOrders(data ?? []);
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-bg px-4 py-8 text-ink">
      <p className="font-display text-lg italic text-ink">Pejastip Handal</p>
      <h1 className="mt-1 font-display text-xl font-semibold">Lacak Order</h1>

      <form onSubmit={handleTrack} className="mt-6 rounded-lg border border-border bg-surface p-5">
        <label className="block text-sm font-medium text-ink">Kode pelacakan</label>
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Contoh: J5HFB4JR"
          className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm uppercase tracking-wide text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {loading ? "Mencari…" : "Lacak"}
        </button>
      </form>

      {orders && orders.length === 0 && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-6 text-center text-sm text-ink-muted">
          Belum ada order aktif untuk kode ini.
        </div>
      )}

      {orders?.map((o) => {
        const items = (o.items as unknown as TrackerItem[]) ?? [];
        return (
          <div key={o.order_id} className="mt-4 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display font-semibold">{o.order_code}</p>
                <p className="text-xs text-ink-muted">{o.event_name}</p>
              </div>
              <StatusChip kind="payment" status={o.payment_state ?? "not_paid"} />
            </div>

            <div className="mt-3 rounded-md bg-surface-sunken p-3">
              <p className="text-xs text-ink-muted">Sisa tagihan</p>
              <p className="font-display text-lg font-semibold text-accent tabular-nums">
                {formatIDR(o.balance_idr)}
              </p>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    {it.title} × {it.qty}
                  </span>
                  <StatusChip kind="shipping" status={it.shipping_status} />
                </div>
              ))}
            </div>

            {o.admin_notes && (
              <div className="mt-3 rounded-md bg-surface-sunken p-3 text-sm text-ink-muted">{o.admin_notes}</div>
            )}

            <p className="mt-3 text-xs text-ink-faint">Dibuat {formatDateID(o.created_at, true)}</p>
          </div>
        );
      })}
    </div>
  );
}
