// Sampul dari cover_url; kalau kosong, sampul "kain" generatif dari palet
// brand supaya rak tetap terlihat seperti rak buku, bukan kotak abu-abu.
const JACKETS = [
  ["#3d6b5e", "#1f4038"],
  ["#b9603f", "#7c2e1d"],
  ["#c79a3e", "#8a6a22"],
  ["#4a5d7a", "#27364d"],
  ["#8c4f6b", "#5a2d43"],
];

function jacketFor(seed: string) {
  // FNV-1a: sebaran lebih rata daripada hash *31 untuk judul pendek.
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return JACKETS[h % JACKETS.length];
}

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
      <img
        src={coverUrl}
        alt={`Sampul ${title}`}
        loading="lazy"
        className={`aspect-[2/3] w-full rounded-sm object-cover shadow-sm ${className}`}
      />
    );
  }
  const [from, to] = jacketFor(title);
  return (
    <div
      role="img"
      aria-label={`Sampul ${title}`}
      className={`flex aspect-[2/3] w-full flex-col justify-between rounded-sm p-2.5 shadow-sm ${className}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
    >
      <span className="h-px w-6 bg-white/40" />
      {compact ? (
        <span className="font-display text-lg font-semibold italic leading-none text-white/80">{title.charAt(0)}</span>
      ) : (
        <div>
          <p className="font-display text-[0.8rem] font-semibold leading-tight text-white [text-wrap:balance]">{title}</p>
          {author && <p className="mt-1 text-[0.65rem] leading-tight text-white/70">{author}</p>}
        </div>
      )}
    </div>
  );
}
