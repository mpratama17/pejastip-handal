// ponytail: parser CSV naif (split koma per baris, tanpa dukungan quoted-comma
// atau newline dalam field). Cukup untuk format import.md ("isbn,title,author,
// format,price_idr,stock", tanpa deskripsi panjang). Upgrade ke papaparse
// kalau nanti ada field yang butuh koma di dalamnya.
export function parseSimpleCSV(text: string): Record<string, string>[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}
