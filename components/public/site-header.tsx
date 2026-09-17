"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSiteSettings } from "@/lib/site-settings";

type NavLink = { href: string; label: string };
type NavGroup = { label: string; links: NavLink[] };
type NavItem = NavLink | NavGroup;

export const NAV: NavItem[] = [
  { href: "/", label: "Beranda" },
  {
    label: "Belanja",
    links: [
      { href: "/catalogue", label: "Katalog" },
      { href: "/ongoing", label: "Batch Berjalan" },
      { href: "/order", label: "Form Order" },
      { href: "/shipping", label: "Form Kirim" },
      { href: "/request", label: "Request Buku" },
    ],
  },
  { href: "/track", label: "Lacak Order" },
  {
    label: "Info",
    links: [
      { href: "/how-to-order", label: "Cara Order" },
      { href: "/terms", label: "Syarat & Ketentuan" },
    ],
  },
];

const isGroup = (item: NavItem): item is NavGroup => "links" in item;

export function SiteHeader() {
  const pathname = usePathname();
  const settings = useSiteSettings();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-ink bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="font-display text-xl font-extrabold tracking-tight text-ink">
          {settings?.store_name || " "}
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Utama">
          {NAV.map((item) =>
            isGroup(item) ? (
              <div key={item.label} className="group relative">
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold ${
                    item.links.some((l) => active(l.href)) ? "bg-primary-soft text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                  <Chevron />
                </button>
                <div className="invisible absolute left-0 top-full min-w-48 pt-1 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <div className="card p-1.5 shadow-hard">
                    {item.links.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        className={`block rounded-sm px-3 py-2 text-sm font-medium ${
                          active(l.href) ? "bg-primary-soft text-ink" : "text-ink hover:bg-surface-sunken"
                        }`}
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  active(item.href) ? "bg-primary-soft text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            ),
          )}
          <Link
            href="/order"
            className="btn btn-primary press ml-2 px-4 py-2 text-sm"
          >
            Order Sekarang
          </Link>
        </nav>

        {/* key = pathname → menu tertutup otomatis setelah pindah halaman */}
        <details key={pathname} className="group md:hidden">
          <summary className="btn btn-secondary flex h-10 w-10 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="sr-only">Buka menu</span>
            <MenuIcon />
          </summary>
          <div className="absolute inset-x-0 top-14 border-b border-ink bg-surface px-4 pb-5 pt-2">
            {NAV.map((item) =>
              isGroup(item) ? (
                <div key={item.label} className="mt-3">
                  <p className="px-2 text-xs font-medium text-ink-faint">{item.label}</p>
                  {item.links.map((l) => (
                    <MobileLink key={l.href} link={l} active={active(l.href)} />
                  ))}
                </div>
              ) : (
                <MobileLink key={item.href} link={item} active={active(item.href)} />
              ),
            )}
            <Link
              href="/order"
              className="btn btn-primary press mt-4 flex w-full px-4 py-3 text-sm"
            >
              Order Sekarang
            </Link>
          </div>
        </details>
      </div>
    </header>
  );
}

function MobileLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      className={`block rounded-full px-3 py-3 text-base ${active ? "bg-primary-soft font-semibold" : "text-ink"}`}
    >
      {link.label}
    </Link>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="opacity-60">
      <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M4 7h14M4 11h14M4 15h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="group-open:hidden"
      />
      <path
        d="M6 6l10 10M16 6 6 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="hidden group-open:block"
      />
    </svg>
  );
}
