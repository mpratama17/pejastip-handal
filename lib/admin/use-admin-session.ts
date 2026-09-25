"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export const NOT_ADMIN_FLAG = "pejastip-not-admin";

// Static export = tanpa middleware. Guard route /admin/* jalan di klien:
// cek session sekali saat mount, lalu ikuti perubahan auth state.
// Login ≠ admin: akun di luar tabel `admins` langsung dikeluarkan. Penegakan
// sebenarnya tetap di RLS/RPC (is_admin()); ini cuma supaya UI tidak kosong.
export function useAdminSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function apply(s: Session | null) {
      if (!s) return setSession(null);
      const { data, error } = await supabase.rpc("is_admin");
      if (cancelled) return;
      // Gagal cek (jaringan dsb.) ≠ bukan admin: jangan logout admin asli.
      // RLS tetap menolak data kalau ternyata bukan admin.
      if (error) {
        console.error("[admin] cek is_admin gagal", error);
        return setSession(s);
      }
      if (data !== true) {
        // Simpan emailnya: halaman login menyebut akun mana yang ditolak.
        sessionStorage.setItem(NOT_ADMIN_FLAG, s.user.email ?? "");
        await supabase.auth.signOut();
        return setSession(null);
      }
      setSession(s);
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // Jangan await di dalam callback (deadlock supabase-js); jadwalkan saja.
      setTimeout(() => apply(s), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return session; // undefined = masih loading, null = belum login / bukan admin
}
