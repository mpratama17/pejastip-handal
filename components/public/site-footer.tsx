"use client";

import Link from "next/link";
import { useSiteSettings, waLink } from "@/lib/site-settings";

const QUICK_LINKS = [
  { href: "/catalogue", label: "Katalog" },
  { href: "/track", label: "Lacak Order" },
  { href: "/order", label: "Form Order" },
  { href: "/how-to-order", label: "Cara Order" },
  { href: "/terms", label: "Syarat & Ketentuan" },
];

export function SiteFooter() {
  const s = useSiteSettings();

  return (
    <footer className="mt-16 border-t border-ink bg-surface">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-extrabold tracking-tight">{s?.store_name}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-muted">{s?.store_about}</p>
        </div>

        <div>
          <p className="text-sm font-bold">Tautan</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-block py-1 hover:text-ink hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-bold">Hubungi kami</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
            {s?.wa_admin_number && (
              <li>
                <a href={waLink(s.wa_admin_number)} target="_blank" rel="noopener noreferrer" className="inline-block py-1 hover:text-ink hover:underline">
                  WhatsApp admin
                </a>
              </li>
            )}
            {s?.wa_group_link && (
              <li>
                <a href={s.wa_group_link} target="_blank" rel="noopener noreferrer" className="inline-block py-1 hover:text-ink hover:underline">
                  Grup WhatsApp
                </a>
              </li>
            )}
            {s?.instagram_handle && (
              <li>
                <a
                  href={`https://instagram.com/${s.instagram_handle.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block py-1 hover:text-ink hover:underline"
                >
                  Instagram @{s.instagram_handle.replace(/^@/, "")}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t-1 border-line">
        <p className="mx-auto max-w-5xl px-4 py-4 text-xs text-ink-faint">
          © {new Date().getFullYear()} {s?.store_name}
        </p>
      </div>
    </footer>
  );
}
