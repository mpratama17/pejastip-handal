"use client";

import { useState } from "react";

export const PAGE_SIZES = [10, 20, 50] as const;

// Paginasi di klien: semua tabel memuat seluruh barisnya sekali (puluhan sampai
// ratusan baris). Kalau suatu saat ribuan, pindah ke .range() Supabase.
export function usePagination<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const [size, setSizeState] = useState<number>(PAGE_SIZES[0]);
  const [lastTotal, setLastTotal] = useState(rows.length);
  // Daftar berubah panjang (filter/cari/hapus) → kembali ke halaman 1, supaya
  // tidak tertinggal di halaman yang isinya sudah tidak ada.
  if (lastTotal !== rows.length) {
    setLastTotal(rows.length);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(page, pageCount);
  const setSize = (n: number) => {
    setSizeState(n);
    setPage(1);
  };
  return {
    pageRows: rows.slice((current - 1) * size, current * size),
    pagination: { page: current, pageCount, total: rows.length, size, setPage, setSize },
  };
}

export function Pagination({
  page,
  pageCount,
  total,
  size,
  setPage,
  setSize,
  unit,
}: ReturnType<typeof usePagination>["pagination"] & { unit: string }) {
  if (total === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
      <div className="flex flex-wrap items-center gap-3">
        <span className="tabular-nums">
          {(page - 1) * size + 1}–{Math.min(page * size, total)} dari {total} {unit}
        </span>
        <label className="flex items-center gap-1.5">
          Tampilkan
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className="btn btn-secondary press px-4 py-1.5 disabled:opacity-40"
          >
            Sebelumnya
          </button>
          <span className="tabular-nums">
            {page}/{pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page === pageCount}
            className="btn btn-secondary press px-4 py-1.5 disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      )}
    </div>
  );
}
