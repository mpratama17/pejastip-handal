"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import { useConfirm } from "@/components/admin/confirm-dialog";
import type { Database } from "@/types/database";

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
      <h1 className="font-display text-xl font-bold text-ink">Dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Order baru" value={stats?.newOrders} href="/admin/orders" />
        <StatCard label="Bukti pending" value={stats?.pendingPayments} href="/admin/payments" />
        <StatCard label="Piutang total" value={stats ? formatIDR(stats.totalReceivable) : undefined} href="/admin/customers" />
        <StatCard label="Event aktif" value={stats?.activeEvents} href="/admin/events" />
      </div>

      <ProofRetention />

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Order terbaru</h2>
          <Link href="/admin/orders" className="text-sm font-medium text-link hover:underline">
            Lihat semua
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-ink bg-surface-sunken text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Kode</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Event</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id} className="border-t-1 border-line">
                  <td className="px-4 py-2">
                    <Link href={`/admin/orders/detail?id=${o.id}`} className="font-medium text-link hover:underline">
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

function StatCard({ label, value, href }: { label: string; value: string | number | undefined; href: string }) {
  return (
    <Link href={href} className="card press stat p-4">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink">{value ?? "…"}</p>
    </Link>
  );
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type PurgeCandidate = Database["public"]["Functions"]["admin_proof_purge_candidates"]["Returns"][number];

// docs/05 §5: bukti transfer order selesai > 6 bulan dihapus supaya storage
// (1 GB gratis) tidak penuh. ponytail: manual dulu; cron bulanan + arsip ikut
// backup di M4.
function ProofRetention() {
  const confirm = useConfirm();
  const [candidates, setCandidates] = useState<PurgeCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc("admin_proof_purge_candidates");
    if (error) return setMessage({ ok: false, text: `Data arsip gagal dimuat: ${error.message}` });
    setCandidates(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const totalBytes = candidates?.reduce((sum, c) => sum + c.size_bytes, 0) ?? 0;

  async function purge() {
    if (!candidates?.length) return;
    const ok = await confirm({
      title: `Hapus ${candidates.length} bukti transfer lama?`,
      body: `File (${formatSize(totalBytes)}) dihapus permanen dari storage. Riwayat pembayaran tetap tersimpan.\n\nPastikan backup terbaru sudah ada kalau file ini masih ingin disimpan.`,
      confirmLabel: "Hapus file",
      tone: "danger",
    });
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    // Storage API menerima banyak path sekaligus; potong per 100 agar request tidak raksasa.
    const paths = candidates.map((c) => c.proof_path);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from("payment-proofs").remove(paths.slice(i, i + 100));
      if (error) {
        setBusy(false);
        return setMessage({ ok: false, text: `Sebagian file gagal dihapus: ${error.message}` });
      }
    }
    // DB hanya menandai bukti yang filenya benar-benar sudah hilang.
    const { data, error } = await supabase.rpc("admin_mark_proofs_purged", {
      p_payment_ids: candidates.map((c) => c.payment_id),
    });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: `File terhapus, tapi pencatatan gagal: ${error.message}` });
    setMessage({ ok: true, text: `${data} bukti transfer diarsipkan.` });
    load();
  }


  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Bukti transfer lama</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          {candidates === null
            ? "Memeriksa…"
            : candidates.length === 0
              ? "Tidak ada bukti dari order selesai lebih dari 6 bulan."
              : `${candidates.length} file (${formatSize(totalBytes)}) dari order selesai lebih dari 6 bulan.`}
        </p>
        {message && (
          <p role="status" className={`mt-1 text-sm ${message.ok ? "text-success" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </div>
      {!!candidates?.length && (
        <button
          type="button"
          onClick={purge}
          disabled={busy}
          className="rounded-md border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-60"
        >
          {busy ? "Menghapus…" : "Hapus file"}
        </button>
      )}
    </section>
  );
}
