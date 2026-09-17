"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { NOT_ADMIN_FLAG } from "@/lib/admin/use-admin-session";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(NOT_ADMIN_FLAG)) {
      sessionStorage.removeItem(NOT_ADMIN_FLAG);
      setError("Akun ini tidak punya akses admin.");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Email atau password salah.");
      return;
    }
    router.push("/admin");
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/admin` },
    });
    if (error) {
      setGoogleLoading(false);
      setError("Gagal memulai login Google.");
    }
    // Sukses = browser redirect ke Google, komponen ini unmount — tidak perlu
    // matikan loading di sini.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <p className="font-display text-lg text-ink">Pejastip Handal</p>
        <h1 className="mt-1 text-sm text-ink-muted">Masuk ke dashboard admin</h1>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunken disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? "Mengarahkan ke Google…" : "Masuk dengan Google"}
        </button>

        <div className="mt-5 flex items-center gap-3 text-xs text-ink-faint">
          <span className="h-px flex-1 bg-border" />
          atau pakai email
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleSubmit}>
        <label className="mt-4 block text-sm font-medium text-ink" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink"
        />

        <label className="mt-4 block text-sm font-medium text-ink" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink"
        />

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn btn-primary press mt-6 w-full px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "Masuk…" : "Masuk"}
        </button>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}
