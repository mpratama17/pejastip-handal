"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { EVENT_STATUS_MAP } from "@/components/status-chip";
import { EVENT_TYPE_LABEL, isBeforeOpen, isPastClose } from "@/lib/labels";
import { formatDateID } from "@/lib/format";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventStatus = Database["public"]["Enums"]["event_status"];
type EventType = Database["public"]["Enums"]["event_type"];

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABEL) as EventType[];
const EVENT_STATUSES = Object.keys(EVENT_STATUS_MAP) as EventStatus[];
// Status yang ikut menggeser status buku (R14) — minta konfirmasi dulu.
const CASCADE_NOTE: Partial<Record<EventStatus, string>> = {
  shipped_to_indo: "Semua buku \"Belum Dikirim\" di batch ini akan menjadi \"Di Perjalanan\".",
  arrived: "Semua buku \"Di Perjalanan\" di batch ini akan menjadi \"Tiba di Admin\".",
};

const inputCls =
  "mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink";

type FormState = {
  name: string;
  type: EventType;
  dp_percent: string;
  eta_note: string;
  description: string;
  opens_at: string; // nilai <input type="datetime-local">, waktu lokal
  closes_at: string;
};

// ISO (UTC) ↔ datetime-local (waktu lokal browser, tanpa zona)
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const toForm = (ev: EventRow): FormState => ({
  name: ev.name,
  type: ev.type,
  dp_percent: String(Number(ev.dp_percent)),
  eta_note: ev.eta_note ?? "",
  description: ev.description ?? "",
  opens_at: toLocalInput(ev.opens_at),
  closes_at: toLocalInput(ev.closes_at),
});

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [defaultDp, setDefaultDp] = useState<Partial<Record<EventType, number>>>({});
  // null = form tertutup, "new" = buat event, selain itu = id event yang diedit
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(Date.now);
  const confirm = useConfirm();

  async function loadEvents() {
    const { data, error } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    if (error) return setError(`Daftar event gagal dimuat: ${error.message}`);
    setEvents(data ?? []);
  }

  useEffect(() => {
    loadEvents();
    supabase
      .from("settings")
      .select("value")
      .eq("key", "default_dp_percent")
      .maybeSingle()
      .then(({ data }) => setDefaultDp((data?.value ?? {}) as Partial<Record<EventType, number>>));
  }, []);

  async function handleStatusChange(ev: EventRow, newStatus: EventStatus) {
    const note = CASCADE_NOTE[newStatus];
    if (note) {
      const ok = await confirm({
        title: `Ubah status jadi ${EVENT_STATUS_MAP[newStatus].label}?`,
        body: `${ev.name}\n\n${note}`,
        confirmLabel: "Ubah status",
      });
      if (!ok) return loadEvents(); // kembalikan <select> ke nilai semula
    }
    setError(null);
    // Selalu lewat RPC (bukan update langsung) — supaya cascade R14 jalan di DB.
    const { error } = await supabase.rpc("admin_set_event_status", { p_event_id: ev.id, p_new_status: newStatus });
    if (error) setError(`Gagal ubah status: ${error.message}`);
    loadEvents();
  }

  // Hapus event hanya lolos kalau belum ada order sama sekali: orders.event_id
  // menahannya di DB (23503). Katalognya ikut terhapus lewat cascade event_items,
  // jadi jumlah bukunya disebut dulu di dialog.
  async function removeEvent(ev: EventRow) {
    const { count } = await supabase
      .from("event_items")
      .select("id", { count: "exact", head: true })
      .eq("event_id", ev.id);
    const ok = await confirm({
      title: "Hapus event ini?",
      body:
        `${ev.name}\n\n` +
        (count
          ? `${count} buku di katalog event ini ikut terhapus. Bukunya sendiri tetap ada di daftar buku.`
          : "Event ini belum punya katalog.") +
        "\n\nTidak bisa dibatalkan.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    const { error } = await supabase.from("events").delete().eq("id", ev.id);
    if (error) {
      setError(
        error.code === "23503"
          ? `"${ev.name}" sudah punya order pelanggan, jadi tidak bisa dihapus. Ubah statusnya jadi Selesai atau Batal saja.`
          : `Gagal hapus: ${error.message}`,
      );
      return;
    }
    loadEvents();
  }

  const blankForm: FormState = {
    name: "",
    type: "publisher_po_us",
    dp_percent: String(defaultDp.publisher_po_us ?? 35),
    eta_note: "",
    description: "",
    opens_at: "",
    closes_at: "",
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Event</h1>
        {editing !== "new" && (
          <button
            onClick={() => {
              setError(null); // jangan tinggalkan error aksi sebelumnya menggantung di bawah tabel
              setEditing("new");
            }}
            className="btn btn-primary press px-4 py-2 text-sm font-semibold"
          >
            + Event Baru
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {editing === "new" && (
        <EventForm
          initial={blankForm}
          defaultDp={defaultDp}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadEvents();
          }}
        />
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-ink bg-surface-sunken text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">DP</th>
              <th className="px-4 py-2 font-medium">Jadwal</th>
              <th className="px-4 py-2 font-medium">ETA</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {events?.map((ev) =>
              editing === ev.id ? (
                <tr key={ev.id} className="border-t-1 border-line">
                  <td colSpan={6} className="p-0">
                    <EventForm
                      eventId={ev.id}
                      initial={toForm(ev)}
                      defaultDp={defaultDp}
                      onCancel={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null);
                        loadEvents();
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={ev.id} className="border-t-1 border-line align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{ev.name}</p>
                    <p className="text-xs text-ink-muted">{EVENT_TYPE_LABEL[ev.type]}</p>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      aria-label={`Status ${ev.name}`}
                      value={ev.status}
                      onChange={(e) => handleStatusChange(ev, e.target.value as EventStatus)}
                      className="rounded-sm border border-border bg-surface px-2 py-1 text-sm"
                    >
                      {EVENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {EVENT_STATUS_MAP[s].label}
                        </option>
                      ))}
                    </select>
                    <ScheduleHint ev={ev} now={now} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">{Number(ev.dp_percent)}%</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    {ev.opens_at || ev.closes_at ? (
                      <>
                        {ev.opens_at ? formatDateID(ev.opens_at) : "…"} – {ev.closes_at ? formatDateID(ev.closes_at) : "…"}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{ev.eta_note ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link href={`/admin/books?event=${ev.id}`} className="mr-3 text-sm font-medium text-ink-muted hover:text-ink">
                      Katalog
                    </Link>
                    <button onClick={() => setEditing(ev.id)} className="text-sm font-semibold text-link hover:underline">
                      Edit
                    </button>
                    <button onClick={() => removeEvent(ev)} className="ml-3 text-sm font-semibold text-danger hover:underline">
                      Hapus
                    </button>
                  </td>
                </tr>
              ),
            )}
            {events === null && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                  Memuat…
                </td>
              </tr>
            )}
            {events?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                  Belum ada event. Buat event pertama dengan tombol di atas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Status "Buka" tapi di luar jadwal → order ditolak server; beri tahu admin.
function ScheduleHint({ ev, now }: { ev: EventRow; now: number }) {
  if (isPastClose(ev, now)) return <p className="mt-1 text-xs text-warning">Lewat tanggal tutup — order ditolak</p>;
  if (isBeforeOpen(ev, now)) return <p className="mt-1 text-xs text-warning">Belum masuk tanggal buka</p>;
  return null;
}

function EventForm({
  eventId,
  initial,
  defaultDp,
  onCancel,
  onSaved,
}: {
  eventId?: string;
  initial: FormState;
  defaultDp: Partial<Record<EventType, number>>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dp = Number(form.dp_percent);
    if (!(dp >= 0 && dp <= 100)) return setError("DP harus 0–100%.");
    if (form.opens_at && form.closes_at && form.closes_at <= form.opens_at)
      return setError("Tanggal tutup harus setelah tanggal buka.");

    setSaving(true);
    setError(null);
    const row = {
      name: form.name.trim(),
      type: form.type,
      dp_percent: dp,
      eta_note: form.eta_note.trim() || null,
      description: form.description.trim() || null,
      opens_at: fromLocalInput(form.opens_at),
      closes_at: fromLocalInput(form.closes_at),
    };
    const { error } = eventId
      ? await supabase.from("events").update(row).eq("id", eventId)
      : await supabase.from("events").insert(row);
    setSaving(false);
    if (error) return setError(`Gagal menyimpan: ${error.message}`);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className={`${eventId ? "bg-primary-soft/40 p-4" : "mt-4 rounded-lg border border-border bg-surface p-5"}`}>
      {!eventId && <h2 className="font-display text-lg font-bold text-ink">Event baru</h2>}
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Nama event
          <input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="mis. PO Amerika #15" className={inputCls} />
        </label>
        <label className="block text-sm font-medium text-ink">
          Tipe
          <select
            value={form.type}
            onChange={(e) => {
              const type = e.target.value as EventType;
              // Event baru: DP ikut default tipe. Event lama: DP tidak diubah diam-diam.
              setForm((f) => ({ ...f, type, dp_percent: eventId ? f.dp_percent : String(defaultDp[type] ?? f.dp_percent) }));
            }}
            className={inputCls}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-ink">
          DP (%)
          <input type="number" required min={0} max={100} step="0.01" value={form.dp_percent} onChange={(e) => set("dp_percent", e.target.value)} className={`${inputCls} tabular-nums`} />
          {eventId && <span className="mt-1 block text-xs font-normal text-ink-faint">Hanya berlaku untuk order baru.</span>}
        </label>
        <label className="block text-sm font-medium text-ink">
          Tanggal buka
          <input type="datetime-local" value={form.opens_at} onChange={(e) => set("opens_at", e.target.value)} className={inputCls} />
          <span className="mt-1 block text-xs font-normal text-ink-faint">Kosong = langsung bisa dipesan saat status Buka.</span>
        </label>
        <label className="block text-sm font-medium text-ink">
          Tanggal tutup
          <input type="datetime-local" value={form.closes_at} onChange={(e) => set("closes_at", e.target.value)} className={inputCls} />
          <span className="mt-1 block text-xs font-normal text-ink-faint">Kosong = buka sampai kuota penuh / ditutup manual.</span>
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Perkiraan tiba (ETA)
          <input value={form.eta_note} onChange={(e) => set("eta_note", e.target.value)} placeholder="mis. 6–8 minggu (udara)" className={inputCls} />
        </label>
        <label className="block text-sm font-medium text-ink sm:col-span-2">
          Deskripsi
          <textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Info tambahan yang tampil di Batch Berjalan" className={inputCls} />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary press px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {saving ? "Menyimpan…" : eventId ? "Simpan perubahan" : "Buat event"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-sunken">
          Batal
        </button>
      </div>
    </form>
  );
}
