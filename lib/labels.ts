import type { Database } from "@/types/database";

type EventType = Database["public"]["Enums"]["event_type"];
type BookFormat = Database["public"]["Enums"]["book_format"];

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  publisher_po_us: "PO Penerbit US",
  publisher_po_uk: "PO Penerbit UK",
  ready_stock: "Ready Stock",
  secondhand: "Buku Bekas",
  special_edition: "Special Edition",
  bbw_jastip: "Jastip Bazar",
  other: "Lainnya",
};

// docs/04 §2.2 — satu warna per tipe batch (selalu dengan teks ink).
export const EVENT_TYPE_COLOR: Record<EventType, string> = {
  publisher_po_us: "bg-type-us",
  publisher_po_uk: "bg-type-uk",
  ready_stock: "bg-type-ready",
  secondhand: "bg-type-used",
  special_edition: "bg-type-special",
  bbw_jastip: "bg-type-bazaar",
  other: "bg-type-other",
};

export const BOOK_FORMAT_LABEL: Record<BookFormat, string> = {
  paperback: "Paperback",
  hardcover: "Hardcover",
  boxset: "Box Set",
  other: "Lainnya",
};

type EventSchedule = { status: string; opens_at: string | null; closes_at: string | null };

export const isPastClose = (ev: EventSchedule, now: number) =>
  ev.status === "open" && !!ev.closes_at && new Date(ev.closes_at).getTime() <= now;
export const isBeforeOpen = (ev: EventSchedule, now: number) =>
  ev.status === "open" && !!ev.opens_at && new Date(ev.opens_at).getTime() > now;

// Sama dengan cek di create_order: status open DAN di dalam jadwal.
// `now` diambil sekali (mis. useState(Date.now)) — render harus murni.
export function isAcceptingOrders(ev: EventSchedule, now: number): boolean {
  return ev.status === "open" && !isPastClose(ev, now) && !isBeforeOpen(ev, now);
}
