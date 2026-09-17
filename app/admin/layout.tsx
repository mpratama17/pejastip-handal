"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAdminSession } from "@/lib/admin/use-admin-session";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Event" },
  { href: "/admin/books", label: "Katalog" },
  { href: "/admin/orders", label: "Order" },
  { href: "/admin/payments", label: "Pembayaran" },
  { href: "/admin/shipments", label: "Pengiriman" },
  { href: "/admin/customers", label: "Customer" },
  { href: "/admin/requests", label: "Request Buku" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAdminSession();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (session === null && !isLoginPage) {
      router.replace("/admin/login");
    }
  }, [session, isLoginPage, router]);

  if (isLoginPage) return children;

  if (session === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">Memuat…</div>;
  }

  if (session === null) {
    // Redirect sedang berjalan (efek di atas) — jangan render apa pun sementara.
    return null;
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="w-56 shrink-0 border-r border-border bg-surface px-4 py-6">
        <p className="font-display text-base italic text-ink">Pejastip Handal</p>
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                pathname === item.href
                  ? "bg-primary-soft text-primary"
                  : "text-ink-muted hover:bg-surface-sunken"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-8 text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Keluar
        </button>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
