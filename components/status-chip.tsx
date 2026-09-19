// docs/04-design-system.md §2.3 — SATU sumber kebenaran mapping warna status.
// Dilarang mewarnai status secara ad-hoc di luar komponen ini.

const PAYMENT_STATE_MAP: Record<string, { label: string; className: string }> = {
  not_paid: { label: "Belum Bayar", className: "bg-danger-soft text-danger" },
  partially_paid: { label: "DP Diterima", className: "bg-warning-soft text-warning" },
  fully_paid: { label: "Lunas", className: "bg-success-soft text-success" },
  overpaid: { label: "Lebih Bayar", className: "bg-info-soft text-info" },
};

// Enam status ini sebenarnya dua perjalanan: luar negeri -> admin (tiga
// pertama), lalu admin -> customer (tiga terakhir). Label lama "Belum Dikirim"
// dan "Dikirim" terbaca seperti satu perjalanan yang sama, jadi customer
// mengira "Belum Dikirim" berarti admin belum mengirim ke dia, padahal artinya
// bukunya belum berangkat dari luar negeri. Labelnya sekarang menyebut kakinya.
//
// `not_shipped` di skema memang menampung dua keadaan sekaligus: belum
// dibelanjakan, dan sudah dibeli tapi belum berangkat. "Belum Berangkat" jujur
// untuk dua-duanya; memecahnya jadi dua status butuh migrasi enum, dan itu
// keputusan terpisah.
export const SHIPPING_STATUS_MAP: Record<string, { label: string; className: string }> = {
  not_shipped: { label: "Belum Berangkat", className: "bg-surface-sunken text-ink-muted" },
  shipped_to_indo: { label: "Menuju Indonesia", className: "bg-info-soft text-info" },
  arrived_in_indo: { label: "Tiba di Admin", className: "bg-primary-soft text-ink" },
  waiting_courier: { label: "Menunggu Kurir", className: "bg-warning-soft text-warning" },
  shipped: { label: "Dikirim ke Kamu", className: "bg-info-soft text-info" },
  delivered: { label: "Diterima", className: "bg-success-soft text-success" },
};

export const EVENT_STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-surface-sunken text-ink-muted" },
  open: { label: "Buka", className: "bg-success-soft text-success" },
  closed: { label: "Ditutup", className: "bg-warning-soft text-warning" },
  ordered: { label: "Dibelanjakan", className: "bg-warning-soft text-warning" },
  shipped_to_indo: { label: "Menuju Indonesia", className: "bg-info-soft text-info" },
  arrived: { label: "Tiba", className: "bg-info-soft text-info" },
  completed: { label: "Selesai", className: "bg-surface-sunken text-ink-muted" },
  cancelled: { label: "Batal", className: "bg-danger-soft text-danger" },
};

const ORDER_STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-warning-soft text-warning" },
  confirmed: { label: "Dikonfirmasi", className: "bg-info-soft text-info" },
  completed: { label: "Selesai", className: "bg-success-soft text-success" },
  cancelled: { label: "Batal", className: "bg-danger-soft text-danger" },
};

const MAPS = {
  payment: PAYMENT_STATE_MAP,
  shipping: SHIPPING_STATUS_MAP,
  event: EVENT_STATUS_MAP,
  order: ORDER_STATUS_MAP,
} as const;

export function StatusChip({
  kind,
  status,
}: {
  kind: keyof typeof MAPS;
  status: string;
}) {
  const entry = MAPS[kind][status] ?? { label: status, className: "bg-surface-sunken text-ink-muted" };
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-bold ${entry.className}`}
    >
      {entry.label}
    </span>
  );
}
