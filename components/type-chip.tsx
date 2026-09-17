import { EVENT_TYPE_COLOR, EVENT_TYPE_LABEL } from "@/lib/labels";
import type { Database } from "@/types/database";

type EventType = Database["public"]["Enums"]["event_type"];

// docs/04 §4 — chip tipe batch, warna dari EVENT_TYPE_COLOR.
export function TypeChip({ type, className = "" }: { type: EventType; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-bold text-ink ${EVENT_TYPE_COLOR[type]} ${className}`}
    >
      {EVENT_TYPE_LABEL[type]}
    </span>
  );
}
