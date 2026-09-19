"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import { EVENT_STATUS_MAP } from "@/components/status-chip";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type CatalogItem = { id: string; price_idr: number; stock: number | null; books: { title: string } | null };
// Baris order: dari katalog (event_item_id) atau buku manual (title + price).
type Line = { key: string; qty: number } & (
  | { kind: "catalog"; event_item_id: string; title: string; price: number }
  | { kind: "manual"; title: string; price: number }
);

const inputCls =
  "mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink";

// Sama dengan normalize_whatsapp() di DB.
function normalizeWa(v: string) {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("0")) d = `62${d.slice(1)}`;
  else if (!d.startsWith("62")) d = `62${d}`;
  return `+${d}`;
}

export default function AdminNewOrderPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [eventId, setEventId] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);

  const [wa, setWa] = useState("");
  // undefined = belum dicek, null = customer baru
  const [customer, setCustomer] = useState<CustomerRow | null | undefined>(undefined);
  const [newName, setNewName] = useState("");

  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [manual, setManual] = useState({ title: "", price: "" });
  const [notes, setNotes] = useState("");

  const [idemKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .not("status", "in", "(draft,completed,cancelled)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) return setError("Daftar batch gagal dimuat.");
        setEvents(data ?? []);
      });
  }, []);

  useEffect(() => {
    if (!eventId) return;
    let stale = false;
    supabase
      .from("event_items")
      .select("id, price_idr, stock, books(title)")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .then(({ data, error }) => {
        if (stale) return;
        if (error) return setError("Katalog batch gagal dimuat.");
        const list = (data as unknown as CatalogItem[]) ?? [];
        list.sort((a, b) => (a.books?.title ?? "").localeCompare(b.books?.title ?? ""));
        setCatalog(list);
      });
    return () => {
      stale = true;
    };
  }, [eventId]);

  // Cari customer otomatis setelah admin berhenti mengetik.
  useEffect(() => {
    setCustomer(undefined);
    if (wa.replace(/\D/g, "").length < 9) return;
    let stale = false;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("whatsapp", normalizeWa(wa)).maybeSingle();
      if (stale) return;
      if (error) return setError("Cek customer gagal.");
      setCustomer(data);
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [wa]);

  function changeEvent(id: string) {
    // Buku katalog terikat ke batch; buku manual boleh ikut pindah.
    setLines((prev) => prev.filter((l) => l.kind === "manual"));
    setCatalog([]);
    setPick("");
    setEventId(id);
  }

  function addCatalog() {
    const c = catalog.find((x) => x.id === pick);
    if (!c) return;
    setLines((prev) => [
      ...prev,
      { key: c.id, kind: "catalog", event_item_id: c.id, title: c.books?.title ?? "—", price: c.price_idr, qty: 1 },
    ]);
    setPick("");
  }

  function addManual() {
    const title = manual.title.trim();
    const price = Number(manual.price);
    if (!title || manual.price === "" || !(price >= 0)) return setError("Buku manual butuh judul dan harga.");
    setError(null);
    setLines((prev) => [...prev, { key: crypto.randomUUID(), kind: "manual", title, price, qty: 1 }]);
    setManual({ title: "", price: "" });
  }

  const setQty = (key: string, next: (q: number) => number) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: Math.max(1, next(l.qty)) } : l)));

  const inOrder = new Set(lines.map((l) => l.key));
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const canSubmit = !!eventId && customer !== undefined && (customer !== null || newName.trim()) && lines.length > 0 && !customer?.is_blacklisted;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("admin_create_order", {
      p_idempotency_key: idemKey,
      p_whatsapp: wa,
      p_full_name: newName,
      p_event_id: eventId,
      p_items: lines.map((l) =>
        l.kind === "catalog" ? { event_item_id: l.event_item_id, qty: l.qty } : { title: l.title, price_idr: l.price, qty: l.qty },
      ),
      p_admin_notes: notes,
    });
    if (error || !data?.[0]) {
      setBusy(false);
      return setError(error?.message ?? "Order tidak tersimpan. Coba lagi.");
    }
    router.push(`/admin/orders/detail?id=${data[0].order_id}`);
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <Link href="/admin/orders" className="text-sm text-ink-muted hover:text-ink">
        ← Order
      </Link>
      <h1 className="mt-2 font-display text-xl font-bold text-ink">Order manual</h1>
      <p className="mt-1 text-sm text-ink-muted">Untuk order yang masuk lewat WhatsApp, termasuk batch tanpa katalog.</p>

      <section className="mt-6 grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Batch
          <select required value={eventId} onChange={(e) => changeEvent(e.target.value)} className={inputCls}>
            <option value="">{events === null ? "Memuat…" : "Pilih batch"}</option>
            {events?.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} · {EVENT_STATUS_MAP[ev.status].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-ink">
          Nomor WhatsApp customer
          <input
            required
            inputMode="tel"
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder="08…"
            className={inputCls}
          />
        </label>
        <div className="text-sm">
          {customer === undefined ? (
            <p className="pt-7 text-ink-faint">Isi nomor untuk mencari customer.</p>
          ) : customer === null ? (
            <label className="block font-medium text-ink">
              Nama customer baru
              <input required value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} />
            </label>
          ) : customer.is_blacklisted ? (
            <p role="alert" className="mt-6 rounded-md bg-danger-soft px-3 py-2 text-danger">
              {customer.full_name} di-blacklist: {customer.blacklist_reason}
            </p>
          ) : (
            <p className="mt-6 rounded-md bg-primary-soft px-3 py-2 text-ink">
              Customer lama: <span className="font-semibold">{customer.full_name}</span> ({customer.code})
            </p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-ink">Buku</h2>

        {lines.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y-1 divide-line">
            {lines.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {l.title}
                  {l.kind === "manual" && <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">manual</span>}
                  <span className="ml-2 text-xs tabular-nums text-ink-faint">{formatIDR(l.price)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <button type="button" aria-label={`Kurangi ${l.title}`} onClick={() => setQty(l.key, (q) => q - 1)} className="h-8 w-8 rounded-sm border border-border hover:bg-surface-sunken">
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums">{l.qty}</span>
                  <button type="button" aria-label={`Tambah ${l.title}`} onClick={() => setQty(l.key, (q) => q + 1)} className="h-8 w-8 rounded-sm border border-border hover:bg-surface-sunken">
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    className="ml-2 rounded-sm px-2 py-1 text-danger hover:bg-danger-soft"
                  >
                    Hapus
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {eventId && catalog.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <select aria-label="Buku dari katalog" value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1 rounded-sm border border-border bg-surface px-2 py-2 text-sm">
              <option value="">Pilih dari katalog batch…</option>
              {catalog
                .filter((c) => !inOrder.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.books?.title} ({formatIDR(c.price_idr)})
                    {c.stock !== null ? ` (stok ${c.stock})` : ""}
                  </option>
                ))}
            </select>
            <button type="button" disabled={!pick} onClick={addCatalog} className="btn btn-secondary press px-3 py-2 text-sm font-semibold disabled:opacity-40">
              Tambah
            </button>
          </div>
        )}

        <div className="mt-3 grid grid-cols-[1fr_9rem_auto] items-end gap-2 border-t-1 border-line pt-3">
          <label className="block text-xs font-medium text-ink-muted">
            {eventId && catalog.length === 0 ? "Batch ini tanpa katalog, tulis judul buku" : "Buku di luar katalog"}
            <input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} placeholder="Judul" className={inputCls} />
          </label>
          <label className="block text-xs font-medium text-ink-muted">
            Harga (Rp)
            <input type="number" min={0} value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} className={`${inputCls} tabular-nums`} />
          </label>
          <button type="button" onClick={addManual} className="btn btn-secondary press px-3 py-2 text-sm font-semibold">
            Tambah
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">Buku manual tidak tampil di katalog publik.</p>

        <p className="mt-4 flex justify-between border-t-1 border-line pt-3 text-sm">
          <span className="text-ink-muted">Subtotal</span>
          <span className="font-display text-lg font-bold tabular-nums">{formatIDR(subtotal)}</span>
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-border bg-surface p-5">
        <label className="block text-sm font-medium text-ink">
          Catatan admin <span className="font-normal text-ink-faint">(tampil di Lacak Order)</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
        </label>
      </section>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!canSubmit || busy}
        className="btn btn-primary press mt-4 px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Menyimpan…" : "Buat order"}
      </button>
    </form>
  );
}
