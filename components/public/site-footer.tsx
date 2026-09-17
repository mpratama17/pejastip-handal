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
    <footer className="mt-16 bg-jacket text-bg">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="font-display text-xl font-semibold italic">{s?.store_name}</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-bg/75">{s?.store_about}</p>
        </div>

        <div>
          <p className="text-sm font-semibold">Tautan</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-bg/75">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-bg hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Hubungi kami</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-bg/75">
            {s?.wa_admin_number && (
              <li>
                <a href={waLink(s.wa_admin_number)} target="_blank" rel="noopener noreferrer" className="hover:text-bg hover:underline">
                  WhatsApp admin
                </a>
              </li>
            )}
            {s?.wa_group_link && (
              <li>
                <a href={s.wa_group_link} target="_blank" rel="noopener noreferrer" className="hover:text-bg hover:underline">
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
                  className="hover:text-bg hover:underline"
                >
                  Instagram @{s.instagram_handle.replace(/^@/, "")}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-bg/15">
        <p className="mx-auto max-w-5xl px-4 py-4 text-xs text-bg/55">
          © {new Date().getFullYear()} {s?.store_name}
        </p>
      </div>
    </footer>
  );
}
