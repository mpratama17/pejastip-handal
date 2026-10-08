"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminSession } from "@/lib/admin/use-admin-session";
import { ConfirmProvider } from "@/components/admin/confirm-dialog";
import { useSiteSettings } from "@/lib/site-settings";

type Counts = { orders: number; payments: number; shipments: number };

// Dikelompokkan per kebutuhan: yang dibuka tiap hari di atas. `badge` = antrean
// yang menunggu admin (dihitung ulang tiap pindah halaman).
const NAV_GROUPS: { title: string; items: { href: string; label: string; badge?: keyof Counts }[] }[] = [
  {
    title: "Harian",
    items: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/orders", label: "Order", badge: "orders" },
      { href: "/admin/payments", label: "Pembayaran", badge: "payments" },
      { href: "/admin/shipments", label: "Pengiriman", badge: "shipments" },
    ],
  },
  {
    title: "Katalog",
    items: [
      { href: "/admin/events", label: "Event" },
      { href: "/admin/books", label: "Katalog" },
      { href: "/admin/requests", label: "Request Buku" },
    ],
  },
  {
    title: "Data",
    items: [
      { href: "/admin/customers", label: "Customer" },
      { href: "/admin/settings", label: "Pengaturan" },
    ],
  },
];

// Menu aktif juga untuk sub-halaman (mis. /admin/orders/detail → Order).
const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAdminSession();
  const isLoginPage = pathname === "/admin/login";
  const [menuOpen, setMenuOpen] = useState(false);
  // Nama dari Pengaturan, sama dengan header publik — bukan ditulis mati.
  const storeName = useSiteSettings()?.store_name || "Admin";

  useEffect(() => {
    if (session === null && !isLoginPage) {
      // Login Google yang gagal kembali ke /admin dengan error_description di
      // query/hash. Diteruskan ke halaman login; kalau tidak, gagalnya diam-diam.
      const params = new URLSearchParams(`${window.location.search.slice(1)}&${window.location.hash.slice(1)}`);
      const oauthError = params.get("error_description");
      router.replace(oauthError ? `/admin/login?error=${encodeURIComponent(oauthError)}` : "/admin/login");
    }
  }, [session, isLoginPage, router]);

  // Antrean untuk badge menu: order baru, bukti transfer menunggu, kiriman belum ada resi.
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => {
    if (!session || isLoginPage) return;
    const head = { count: "exact" as const, head: true };
    Promise.all([
      supabase.from("orders").select("id", head).eq("status", "pending"),
      supabase.from("payments").select("id", head).eq("status", "pending"),
      supabase.from("shipments").select("id", head).is("tracking_number", null),
    ]).then(([o, p, sh]) => setCounts({ orders: o.count ?? 0, payments: p.count ?? 0, shipments: sh.count ?? 0 }));
  }, [session, isLoginPage, pathname]);

  // Drawer HP menutup sendiri setelah pindah halaman.
  useEffect(() => setMenuOpen(false), [pathname]);

  if (isLoginPage) return children;

  if (session === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">Memuat…</div>;
  }

  if (session === null) {
    // Redirect sedang berjalan (efek di atas) — jangan render apa pun sementara.
    return null;
  }

  return (
    <ConfirmProvider>
      <div className="admin-theme min-h-screen bg-bg md:flex">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink bg-surface px-4 py-3 md:hidden">
          <p className="font-display text-lg font-extrabold tracking-tight text-ink">{storeName}</p>
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls="admin-nav"
            onClick={() => setMenuOpen((v) => !v)}
            className="btn btn-secondary px-3 py-1.5 text-sm"
          >
            {menuOpen ? "Tutup" : "Menu"}
          </button>
        </header>

        {menuOpen && (
          <div aria-hidden="true" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-ink/40 md:hidden" />
        )}

        <aside
          id="admin-nav"
          className={`${
            menuOpen ? "fixed inset-y-0 left-0 z-40 flex" : "hidden"
          } w-64 shrink-0 flex-col overflow-y-auto border-r border-ink bg-surface px-4 py-6 md:sticky md:top-0 md:flex md:h-screen md:w-56`}
        >
          <p className="font-display text-lg font-extrabold tracking-tight text-ink">{storeName}</p>
          <nav className="mt-6 flex flex-col gap-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint">{group.title}</p>
                <div className="mt-1 flex flex-col gap-1">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    const n = item.badge && counts ? counts[item.badge] : 0;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex items-center justify-between gap-2 rounded-full px-3 py-2 text-sm font-semibold ${
                          active ? "border border-ink bg-primary text-ink" : "border border-transparent text-ink-muted hover:bg-surface-sunken"
                        }`}
                      >
                        {item.label}
                        {n > 0 && (
                          <span
                            aria-label={`${n} menunggu`}
                            className="min-w-5 rounded-full bg-danger px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white tabular-nums"
                          >
                            {n > 99 ? "99+" : n}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t-1 border-line pt-4 text-sm">
            <a href="/" target="_blank" rel="noopener noreferrer" className="font-semibold text-link hover:underline">
              Lihat toko ↗
            </a>
            <p className="truncate text-xs text-ink-muted" title={session.user.email ?? ""}>
              {session.user.email}
            </p>
            <button
              onClick={() => supabase.auth.signOut()}
              className="btn btn-secondary press self-start px-3 py-1.5 text-sm"
            >
              Keluar
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
      </div>
    </ConfirmProvider>
  );
}
