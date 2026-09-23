"use client";

import { useState } from "react";

// Sort di klien, bukan di query. Tabel admin memuat seluruh barisnya sekali
// (katalog satu event, daftar customer), jadi urutannya bisa diubah tanpa
// bolak-balik ke server. Kalau suatu saat datanya dipaginasi, ini harus pindah
// ke .order() Supabase — bukan dipertahankan lalu diam-diam mengurutkan
// sepotong data.

export type SortState<K extends string> = { key: K; dir: "asc" | "desc" };

export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const onSort = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return { sort, onSort, setSort };
}

/** `value` memetakan baris + kolom ke nilai banding. `null` = kosong. */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K>,
  value: (row: T, key: K) => string | number | null,
): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    // Baris kosong selalu di bawah, arah apa pun — membalik urutan tidak
    // seharusnya menaikkan "—" ke atas.
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y), "id") * sign;
  });
}

export function SortTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-link ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-ink" : ""}`}
      >
        {label}
        <span aria-hidden className={active ? "text-link" : "text-ink-faint"}>
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
