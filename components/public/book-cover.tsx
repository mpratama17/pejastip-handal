// Sampul dari cover_url; kalau kosong, sampul generatif berwarna datar dari
// palet tipe batch (docs/04 §6) supaya rak tetap terlihat seperti rak buku.
const JACKETS = [
  "var(--color-type-us)",
  "var(--color-type-uk)",
  "var(--color-type-ready)",
  "var(--color-type-used)",
  "var(--color-type-special)",
  "var(--color-type-bazaar)",
];

function jacketFor(seed: string) {
  // FNV-1a: sebaran lebih rata daripada hash *31 untuk judul pendek.
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return JACKETS[h % JACKETS.length];
}

const frame = (compact: boolean) => `aspect-[2/3] w-full border-[1.5px] border-ink ${compact ? "rounded-[3px]" : "rounded-sm"}`;

export function BookCover({
  title,
  author,
  coverUrl,
  compact = false,
  className = "",
}: {
  title: string;
  author?: string | null;
  coverUrl?: string | null;
  /** Thumbnail kecil (< ~80px): tanpa teks, judul sudah tampil di sebelahnya. */
  compact?: boolean;
  className?: string;
}) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export: tanpa image optimizer
      <img src={coverUrl} alt={`Sampul ${title}`} loading="lazy" className={`${frame(compact)} bg-surface object-cover ${className}`} />
    );
  }
  return (
    <div
      role="img"
      aria-label={`Sampul ${title}`}
      className={`${frame(compact)} flex flex-col justify-between text-ink ${compact ? "p-1" : "p-2.5"} ${className}`}
      style={{ background: jacketFor(title) }}
    >
      <span className={`h-[3px] rounded-full bg-ink ${compact ? "w-1/2" : "w-6"}`} />
      {compact ? (
        <span className="font-display text-sm font-extrabold leading-none">{title.charAt(0)}</span>
      ) : (
        <div>
          <p className="font-display text-[0.85rem] font-extrabold leading-tight [text-wrap:balance]">{title}</p>
          {author && <p className="mt-1 text-[0.65rem] font-medium leading-tight text-ink/70">{author}</p>}
        </div>
      )}
    </div>
  );
}
