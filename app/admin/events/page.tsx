"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { StatusChip } from "@/components/status-chip";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventStatus = Database["public"]["Enums"]["event_status"];
type EventType = Database["public"]["Enums"]["event_type"];

const EVENT_TYPES: EventType[] = [
  "publisher_po_us",
  "publisher_po_uk",
  "ready_stock",
  "secondhand",
  "special_edition",
  "bbw_jastip",
  "other",
];

const EVENT_STATUSES: EventStatus[] = [
  "draft",
  "open",
  "closed",
  "ordered",
  "shipped_to_indo",
  "arrived",
  "completed",
  "cancelled",
];

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "publisher_po_us" as EventType,
    dp_percent: "35",
    eta_note: "",
  });

  async function loadEvents() {
    setLoading(true);
    const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    setEvents(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("events").insert({
      name: form.name,
      type: form.type,
      dp_percent: Number(form.dp_percent),
      eta_note: form.eta_note || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ name: "", type: "publisher_po_us", dp_percent: "35", eta_note: "" });
    setShowForm(false);
    loadEvents();
  }

  async function handleStatusChange(eventId: string, newStatus: EventStatus) {
    // Selalu lewat RPC (bukan update langsung) — supaya cascade R14
    // (shipped_to_indo/arrived → item) jalan otomatis, tanpa cabang logic di klien.
    const { error } = await supabase.rpc("admin_set_event_status", {
      p_event_id: eventId,
      p_new_status: newStatus,
    });
    if (error) {
      alert(`Gagal ubah status: ${error.message}`);
      return;
    }
    loadEvents();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Event</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          {showForm ? "Batal" : "+ Event Baru"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 rounded-lg border border-border bg-surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-ink">Nama event</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="mis. PO Amerika #15"
                className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Tipe</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}
                className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">DP (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.dp_percent}
                onChange={(e) => setForm({ ...form, dp_percent: e.target.value })}
                className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Catatan ETA</label>
              <input
                value={form.eta_note}
                onChange={(e) => setForm({ ...form, eta_note: e.target.value })}
                placeholder="mis. 6-8 minggu (udara)"
                className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? "Menyimpan…" : "Simpan Event"}
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Nama</th>
              <th className="px-4 py-2 font-medium">Tipe</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">DP</th>
              <th className="px-4 py-2 font-medium">ETA</th>
              <th className="px-4 py-2 font-medium">Ubah status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium text-ink">{ev.name}</td>
                <td className="px-4 py-2 text-ink-muted">{ev.type}</td>
                <td className="px-4 py-2">
                  <StatusChip kind="event" status={ev.status} />
                </td>
                <td className="px-4 py-2 tabular-nums text-ink">{ev.dp_percent}%</td>
                <td className="px-4 py-2 text-ink-muted">{ev.eta_note ?? "—"}</td>
                <td className="px-4 py-2">
                  <select
                    value={ev.status}
                    onChange={(e) => handleStatusChange(ev.id, e.target.value as EventStatus)}
                    className="rounded-sm border border-border px-2 py-1 text-sm"
                  >
                    {EVENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">
                  Belum ada event. Buat yang pertama.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
