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

export const BOOK_FORMAT_LABEL: Record<BookFormat, string> = {
  paperback: "Paperback",
  hardcover: "Hardcover",
  boxset: "Box Set",
  other: "Lainnya",
};
