"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";

type Stats = {
  newOrders: number;
  pendingPayments: number;
  totalReceivable: number;
  activeEvents: number;
};

type RecentOrder = {
  id: string;
  order_code: string;
  total_idr: number;
  created_at: string;
  customers: { full_name: string } | null;
  events: { name: string } | null;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    async function load() {
      const [ordersRes, paymentsRes, balanceRes, eventsRes, recentRes] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("v_customer_balance").select("total_balance_idr"),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase
          .from("orders")
          .select("id, order_code, total_idr, created_at, customers(full_name), events(name)")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);

      const totalReceivable = (balanceRes.data ?? []).reduce(
        (sum, row) => sum + (row.total_balance_idr ?? 0),
        0,
      );

      setStats({
        newOrders: ordersRes.count ?? 0,
        pendingPayments: paymentsRes.count ?? 0,
        totalReceivable,
        activeEvents: eventsRes.count ?? 0,
      });
      setRecentOrders((recentRes.data as unknown as RecentOrder[]) ?? []);
    }
    load();
  }, []);

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-ink">Dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Order baru" value={stats?.newOrders} />
        <StatCard label="Bukti pending" value={stats?.pendingPayments} />
        <StatCard label="Piutang total" value={stats ? formatIDR(stats.totalReceivable) : undefined} />
        <StatCard label="Event aktif" value={stats?.activeEvents} />
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Order terbaru</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-primary hover:underline">
            Lihat semua
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-left text-ink-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Kode</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link href={`/admin/orders/detail?id=${o.id}`} className="font-medium text-primary hover:underline">
                      {o.order_code}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink">{o.customers?.full_name ?? "—"}</td>
                  <td className="px-4 py-2 text-ink-muted">{o.events?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">
                    {formatIDR(o.total_idr)}
                  </td>
                </tr>
              ))}
              {recentOrders.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-faint">
                    Belum ada order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink">{value ?? "…"}</p>
    </div>
  );
}
