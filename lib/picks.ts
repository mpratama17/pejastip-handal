// Pilihan buku dari katalog ("+ Pesan"), disimpan di browser per batch lalu
// dibaca form order. Hanya kenyamanan: server tetap memeriksa stok & batch,
// dan storage bisa kosong/terblokir (mode privat) — semua akses di-try/catch.
export type Picks = Record<string, number>; // event_item_id → qty

const key = (eventId: string) => `jastip:picks:${eventId}`;

export function loadPicks(eventId: string): Picks {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(eventId)) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePicks(eventId: string, picks: Picks) {
  try {
    const kept = Object.fromEntries(Object.entries(picks).filter(([, q]) => q > 0));
    if (Object.keys(kept).length) localStorage.setItem(key(eventId), JSON.stringify(kept));
    else localStorage.removeItem(key(eventId));
  } catch {}
}
