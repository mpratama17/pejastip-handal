"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { formatIDR, formatDateID } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import { SortTh, sortRows, useSort } from "@/components/admin/sortable";
import type { Database } from "@/types/database";

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Balance = Database["public"]["Views"]["v_customer_balance"]["Row"];
type CustSortKey = "name" | "code" | "whatsapp" | "debt";

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={null}>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const router = useRouter();
  const selectedId = useSearchParams().get("id");
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [balances, setBalances] = useState<Record<string, Balance>>({});
  const [search, setSearch] = useState("");
  const [onlyDebt, setOnlyDebt] = useState(false);
  const { sort, onSort } = useSort<CustSortKey>({ key: "name", dir: "asc" });

  const load = useCallback(async () => {
    const [c, b] = await Promise.all([
      supabase.from("customers").select("*").order("created_at", { ascending: false }),
      supabase.from("v_customer_balance").select("*"),
    ]);
    setCustomers(c.data ?? []);
    setBalances(Object.fromEntries((b.data ?? []).map((r) => [r.customer_id, r])));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const found = (customers ?? []).filter((c) => {
      if (onlyDebt && !(balances[c.id]?.total_balance_idr ?? 0)) return false;
      if (!q) return true;
      return [c.full_name, c.code, c.whatsapp, c.instagram].some((v) => v?.toLowerCase().includes(q));
    });
    return sortRows(found, sort, (c, key) =>
      key === "name" ? c.full_name
      : key === "code" ? c.code
      : key === "whatsapp" ? c.whatsapp
      : (balances[c.id]?.total_balance_idr ?? 0),
    );
  }, [customers, balances, search, onlyDebt, sort]);

  const selected = customers?.find((c) => c.id === selectedId);

  return (
    <div>
      <h1 className="font-display text-xl font-bold text-ink">Customer</h1>

      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_28rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, kode, WA, Instagram"
              className="w-72 rounded-sm border border-border px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} />
              Hanya yang punya piutang
            </label>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-ink bg-surface-sunken text-left">
                <tr>
                  <SortTh label="Nama" sortKey="name" sort={sort} onSort={onSort} />
                  <SortTh label="Kode" sortKey="code" sort={sort} onSort={onSort} />
                  <SortTh label="WhatsApp" sortKey="whatsapp" sort={sort} onSort={onSort} />
                  <SortTh label="Piutang" sortKey="debt" sort={sort} onSort={onSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const bal = balances[c.id]?.total_balance_idr ?? 0;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.replace(`/admin/customers?id=${c.id}`, { scroll: false })}
                      className={`cursor-pointer border-t-1 border-line ${c.id === selectedId ? "bg-primary-soft" : "bg-surface hover:bg-surface-sunken"}`}
                    >
                      <td className="px-4 py-2 font-medium">
                        {c.full_name}
                        {c.is_blacklisted && (
                          <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">Blacklist</span>
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-ink-muted">{c.code}</td>
                      <td className="px-4 py-2 tabular-nums text-ink-muted">{c.whatsapp}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${bal > 0 ? "font-semibold text-accent-ink" : "text-ink-faint"}`}>
                        {formatIDR(bal)}
                      </td>
                    </tr>
                  );
                })}
                {customers && filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-ink-faint">
                      Tidak ada customer yang cocok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selected ? (
          <CustomerDetail key={selected.id} customer={selected} onChanged={load} />
        ) : (
          <p className="hidden rounded-lg border border-dashed border-border p-8 text-center text-sm text-ink-faint xl:block">
            Pilih customer untuk melihat detail.
          </p>
        )}
      </div>
    </div>
  );
}

type CustomerOrder = Database["public"]["Tables"]["orders"]["Row"] & { events: { name: string } | null };

function CustomerDetail({ customer: c, onChanged }: { customer: Customer; onChanged: () => void }) {
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [states, setStates] = useState<Record<string, Database["public"]["Views"]["v_order_payment"]["Row"]>>({});
  const [notes, setNotes] = useState(c.notes ?? "");
  const [reason, setReason] = useState(c.blacklist_reason ?? "");
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*, events(name)")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .then(async ({ data }) => {
        const list = (data as unknown as CustomerOrder[]) ?? [];
        setOrders(list);
        if (list.length) {
          const { data: vp } = await supabase.from("v_order_payment").select("*").in("order_id", list.map((o) => o.id));
          setStates(Object.fromEntries((vp ?? []).map((r) => [r.order_id, r])));
        }
      });
  }, [c.id]);

  async function update(patch: Partial<Customer>, success: string) {
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.from("customers").update(patch).eq("id", c.id);
    setBusy(false);
    if (error) {
      setMessage(error.message.includes("blacklist_reason") ? "Alasan blacklist wajib diisi." : error.message);
      return;
    }
    setMessage(success);
    onChanged();
  }

  async function toggleBlacklist() {
    if (c.is_blacklisted) {
      const ok = await confirm({
        title: `Buka blacklist ${c.full_name}?`,
        body: "Nomor ini bisa order lagi.",
        confirmLabel: "Buka blacklist",
      });
      if (!ok) return;
      update({ is_blacklisted: false, blacklist_reason: null }, "Blacklist dibuka.");
    } else {
      if (!reason.trim()) return setMessage("Isi alasan blacklist dulu.");
      const ok = await confirm({
        title: `Blacklist ${c.full_name}?`,
        body: `Order baru dari ${c.whatsapp} akan ditolak.\nAlasan: ${reason.trim()}`,
        confirmLabel: "Blacklist",
        tone: "danger",
      });
      if (!ok) return;
      update({ is_blacklisted: true, blacklist_reason: reason.trim() }, "Customer di-blacklist.");
    }
  }

  return (
    <aside className="h-fit rounded-lg border border-border bg-surface p-5 xl:sticky xl:top-6">
      <p className="font-display text-xl font-bold">{c.full_name}</p>
      <p className="text-sm text-ink-muted">
        <span className="tabular-nums">{c.code}</span> · {c.whatsapp}
        {c.instagram ? ` · ${c.instagram}` : ""}
      </p>
      <p className="text-xs text-ink-faint">Pelanggan sejak {formatDateID(c.created_at)}</p>

      <h3 className="mt-5 text-sm font-semibold">Riwayat order</h3>
      <ul className="mt-2 flex flex-col divide-y-1 divide-line text-sm">
        {orders?.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <Link href={`/admin/orders/detail?id=${o.id}`} className="font-medium text-link hover:underline">
                {o.order_code}
              </Link>
              <p className="truncate text-xs text-ink-muted">{o.events?.name}</p>
            </div>
            <div className="text-right">
              {o.status === "cancelled" ? (
                <StatusChip kind="order" status="cancelled" />
              ) : (
                <StatusChip kind="payment" status={states[o.id]?.payment_state ?? "not_paid"} />
              )}
              <p className="mt-0.5 text-xs tabular-nums text-ink-muted">sisa {formatIDR(states[o.id]?.balance_idr)}</p>
            </div>
          </li>
        ))}
        {orders?.length === 0 && <li className="py-2 text-ink-faint">Belum pernah order.</li>}
      </ul>

      <label className="mt-5 block text-sm font-semibold">
        Catatan internal
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm font-normal" />
      </label>
      <button
        onClick={() => update({ notes: notes.trim() || null }, "Catatan disimpan.")}
        disabled={busy}
        className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm font-semibold hover:bg-surface-sunken disabled:opacity-60"
      >
        Simpan catatan
      </button>

      <div className={`mt-5 rounded-md p-3 ${c.is_blacklisted ? "bg-danger-soft" : "bg-surface-sunken"}`}>
        <p className="text-sm font-semibold">{c.is_blacklisted ? "Customer ini di-blacklist" : "Blacklist"}</p>
        {c.is_blacklisted ? (
          <p className="mt-1 text-sm">Alasan: {c.blacklist_reason}</p>
        ) : (
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan (wajib), mis. batal order 2x setelah dibelanjakan"
            className="mt-2 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm"
          />
        )}
        <button
          onClick={toggleBlacklist}
          disabled={busy}
          className={`mt-2 rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${
            c.is_blacklisted ? "border border-border bg-surface" : "bg-danger text-white"
          }`}
        >
          {c.is_blacklisted ? "Buka Blacklist" : "Blacklist Customer"}
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-ink-muted" role="status">{message}</p>}
    </aside>
  );
}
