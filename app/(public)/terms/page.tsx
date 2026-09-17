"use client";

import { useSiteSettings } from "@/lib/site-settings";

export default function TermsPage() {
  const s = useSiteSettings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Syarat &amp; ketentuan</h1>
      <p className="mt-1 text-sm text-ink-muted">Berlaku untuk semua order di {s?.store_name || "toko ini"}.</p>

      {s === null ? (
        <div className="mt-8 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-sunken" />
          ))}
        </div>
      ) : (
        <>
          {s.terms.length > 1 && (
            <nav aria-label="Daftar isi" className="mt-8 rounded-lg border border-border bg-surface p-5">
              <p className="text-sm font-semibold">Daftar isi</p>
              <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {s.terms.map((t, i) => (
                  <li key={t.title}>
                    <a href={`#s${i + 1}`} className="text-link hover:underline">
                      {i + 1}. {t.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="mt-8 flex flex-col gap-8">
            {s.terms.map((t, i) => (
              <section key={t.title} id={`s${i + 1}`} className="scroll-mt-20">
                <h2 className="font-display text-xl font-semibold">
                  {i + 1}. {t.title}
                </h2>
                <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-muted">{t.body}</p>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
