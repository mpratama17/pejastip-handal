"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatDateID } from "@/lib/format";
import { BOOK_FORMAT_LABEL } from "@/lib/labels";
import { waLink } from "@/lib/site-settings";
import type { Database } from "@/types/database";

type RequestRow = Database["public"]["Tables"]["book_requests"]["Row"];
type RequestStatus = Database["public"]["Enums"]["request_status"];

const STATUS: { value: RequestStatus; label: string; className: string }[] = [
  { value: "new", label: "Baru", className: "bg-info-soft text-info" },
  { value: "sourcing", label: "Dicari", className: "bg-warning-soft text-warning" },
  { value: "quoted", label: "Ada harga", className: "bg-primary-soft text-ink" },
  { value: "fulfilled", label: "Masuk katalog", className: "bg-success-soft text-success" },
  { value: "rejected", label: "Tidak tersedia", className: "bg-surface-sunken text-ink-muted" },
];

export default function AdminRequestsPage() {
  const [showClosed, setShowClosed] = useState(false);
  const [rows, setRows] = useState<RequestRow[] | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from("book_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (!showClosed) q = q.in("status", ["new", "sourcing", "quoted"]);
    const { data } = await q;
    setRows(data ?? []);
  }, [showClosed]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: RequestStatus) {
    setRows((r) => r?.map((x) => (x.id === id ? { ...x, status } : x)) ?? null);
    const { error } = await supabase.from("book_requests").update({ status }).eq("id", id);
    if (error) load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-ink">Request buku</h1>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Tampilkan yang sudah selesai
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-left text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Judul</th>
              <th className="px-4 py-2 font-medium">ISBN · Format</th>
              <th className="px-4 py-2 font-medium">Peminta</th>
              <th className="px-4 py-2 font-medium">Masuk</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => {
              const st = STATUS.find((s) => s.value === r.status)!;
              return (
                <tr key={r.id} className="border-t-1 border-line bg-surface align-top">
                  <td className="px-4 py-2">
                    <p className="font-medium">{r.title}</p>
                    {r.notes && <p className="text-xs text-ink-muted">{r.notes}</p>}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-ink-muted">
                    {r.isbn ?? "—"}
                    {r.format ? ` · ${BOOK_FORMAT_LABEL[r.format]}` : ""}
                  </td>
                  <td className="px-4 py-2">
                    {r.customer_name}
                    <a
                      href={waLink(r.whatsapp, `Halo ${r.customer_name}, soal request buku "${r.title}"…`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-link hover:underline"
                    >
                      {r.whatsapp}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{formatDateID(r.created_at)}</td>
                  <td className="px-4 py-2">
                    <select
                      value={r.status}
                      onChange={(e) => setStatus(r.id, e.target.value as RequestStatus)}
                      className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold ${st.className}`}
                    >
                      {STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-faint">
                  Belum ada request.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
