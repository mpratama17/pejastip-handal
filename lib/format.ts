// docs/04-design-system.md §5 — satu util formatIDR(), dilarang format manual.
const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "decimal",
  maximumFractionDigits: 0,
});

export function formatIDR(amount: number | null | undefined): string {
  return `Rp${idrFormatter.format(amount ?? 0)}`;
}

export function formatDateID(iso: string, withTime = false): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (!withTime) return datePart;
  const timePart = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}
