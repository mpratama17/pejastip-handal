"use client";

import { useState } from "react";

type Cell = string | number | Date | null;
export type Sheet = { name: string; header: string[]; rows: Cell[][] };

// +6281299884551 → "0812-9988-4551": format yang dikenal client, dan karena ada
// strip Excel tidak menganggapnya angka (nol depan aman, tanpa segitiga hijau).
export function phone(v: string | null | undefined): string | null {
  if (!v) return null;
  const local = v.startsWith("+62") ? `0${v.slice(3)}` : v;
  return /^0\d{9,}$/.test(local) ? local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3") : v;
}

const colName = (i: number): string => (i < 26 ? "" : colName(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

// Ambil semua baris (PostgREST membatasi ~1000 per request), halaman demi halaman.
// T diisi pemanggil: tipe hasil join Supabase tidak selalu tersimpul rapi.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const SIZE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await page(from, from + SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < SIZE) return all;
  }
}

// Ekspor .xlsx di browser. Library-nya dimuat hanya saat tombol diklik.
export function ExportButton({ fileName, build }: { fileName: string; build: () => Promise<Sheet[]> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    setBusy(true);
    setError(false);
    try {
      const [sheets, { default: writeExcelFile }] = await Promise.all([build(), import("write-excel-file/browser")]);
      const bold = (h: string) => ({ value: h, fontWeight: "bold" as const });
      const date = new Date().toISOString().slice(0, 10);
      // Lebar kolom kira-kira dari isi terpanjang (dibatasi supaya catatan panjang tidak melebar).
      const width = (s: Sheet, i: number) =>
        Math.min(40, Math.max(10, ...[s.header[i], ...s.rows.map((r) => r[i])].map((v) => (v instanceof Date ? 12 : String(v ?? "").length + 2))));
      await writeExcelFile(
        sheets.map((s) => ({
          sheet: s.name,
          // Angka diberi pemisah ribuan (Excel Indonesia menampilkan 2.489.000), tetap bisa dijumlah.
          data: [s.header.map(bold), ...s.rows.map((r) => r.map((v) => (typeof v === "number" ? { value: v, format: "#,##0" } : v)))],
          columns: s.header.map((_, i) => ({ width: width(s, i) })),
          stickyRowsCount: 1,
          dateFormat: "dd/mm/yyyy",
        })),
        { features: [autoFilter(sheets)] },
      ).toFile(`${fileName}-${date}.xlsx`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-danger" role="alert">Export gagal, coba lagi.</span>}
      <button type="button" onClick={run} disabled={busy} className="btn btn-secondary press px-3 py-2 text-sm disabled:opacity-50">
        {busy ? "Menyiapkan…" : "Export Excel"}
      </button>
    </span>
  );
}

// Tombol filter di baris judul tiap sheet (write-excel-file tidak punya bawaan).
// <autoFilter> harus tepat setelah </sheetData> menurut urutan elemen worksheet.
function autoFilter(sheets: Sheet[]) {
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform: (xml: string, _opts: unknown, { sheetIndex }: { sheetIndex: number }) => {
            const s = sheets[sheetIndex];
            if (!s) return xml;
            const ref = `A1:${colName(s.header.length - 1)}${s.rows.length + 1}`;
            return xml.replace("</sheetData>", `</sheetData><autoFilter ref="${ref}"/>`);
          },
        },
      },
    },
  };
}
