// Stiker dekoratif (docs/04 §3): hanya hero, halaman sukses, empty state, 404;
// maks 3 per layar; selalu aria-hidden.

type StickerProps = { className?: string };

export function StarSticker({ className = "" }: StickerProps) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        d="M24 3c1.6 11 5 14.4 21 21-16 6.6-19.4 10-21 21-1.6-11-5-14.4-21-21 16-6.6 19.4-10 21-21Z"
        fill="var(--color-type-special)"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DaisySticker({ className = "" }: StickerProps) {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      {petals.map((deg) => (
        <ellipse
          key={deg}
          cx="32"
          cy="15"
          rx="7"
          ry="13"
          transform={`rotate(${deg} 32 32)`}
          fill="var(--color-type-uk)"
          stroke="var(--color-ink)"
          strokeWidth="2.5"
        />
      ))}
      <circle cx="32" cy="32" r="8" fill="var(--color-primary)" stroke="var(--color-ink)" strokeWidth="2.5" />
    </svg>
  );
}

// Badge teks melingkar (R1). Teks diulang mengelilingi lingkaran.
export function CircleBadge({ text, className = "" }: StickerProps & { text: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" className={className}>
      <defs>
        <path id="badge-ring" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="3" />
      <circle cx="60" cy="60" r="24" fill="var(--color-bg)" stroke="var(--color-ink)" strokeWidth="3" />
      <text fontSize="12.5" fontWeight="800" letterSpacing="1.5" fill="var(--color-ink)" fontFamily="var(--font-sans)">
        <textPath href="#badge-ring">{text}</textPath>
      </text>
    </svg>
  );
}

// Panah coretan tangan yang "menunjuk" ke tombol (R1).
export function SquiggleArrow({ className = "" }: StickerProps) {
  return (
    <svg viewBox="0 0 160 70" aria-hidden="true" fill="none" className={className}>
      <path
        d="M154 8C120 6 104 30 112 42c8 12 26-4 12-12-16-9-40 22-66 26-22 3-38-8-50-22"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path d="M8 34l-2 12 12-3" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
