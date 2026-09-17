"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminSession } from "@/lib/admin/use-admin-session";
import { ConfirmProvider } from "@/components/admin/confirm-dialog";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Event" },
  { href: "/admin/books", label: "Katalog" },
  { href: "/admin/orders", label: "Order" },
  { href: "/admin/payments", label: "Pembayaran" },
  { href: "/admin/shipments", label: "Pengiriman" },
  { href: "/admin/customers", label: "Customer" },
  { href: "/admin/requests", label: "Request Buku" },
  { href: "/admin/settings", label: "Pengaturan" },
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

  useEffect(() => {
    if (session === null && !isLoginPage) {
      router.replace("/admin/login");
    }
  }, [session, isLoginPage, router]);

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
          <p className="font-display text-lg font-extrabold tracking-tight text-ink">Pejastip Handal</p>
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
          <p className="font-display text-lg font-extrabold tracking-tight text-ink">Pejastip Handal</p>
          <nav className="mt-6 flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={`rounded-full px-3 py-2 text-sm font-semibold ${
                  isActive(pathname, item.href) ? "border border-ink bg-primary text-ink" : "border border-transparent text-ink-muted hover:bg-surface-sunken"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-8 self-start text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Keluar
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
      </div>
    </ConfirmProvider>
  );
}
