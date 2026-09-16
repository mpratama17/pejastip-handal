# Jastip Buku — Progress

Snapshot status saat ini. Diupdate tiap close-out, ditimpa bukan ditambah.

## Status

- **Dokumen** (`docs/01-05`, `README.md`): ✅ disepakati — schema, halaman, PRD, design system, proteksi kuota. Tech stack sempat direvisi total (Next.js server/OpenNext → static export + RPC Postgres + Supabase Edge Functions) setelah second opinion; semua dokumen sudah konsisten dengan arah baru.
- **Identitas visual**: ✅ disepakati — brand "Pejastip Handal", token warna (pine/cover/paper/brick) + tipografi (Fraunces/Inter), lihat `docs/04-design-system.md`.
- **Kode**: 🚧 baru scaffold, belum ada fitur.
  - Next.js 16 (App Router, TS, Tailwind v4, static export) — `pnpm build` lulus.
  - Token desain & font sudah masuk `app/globals.css` / `app/layout.tsx`.
  - Belum ada halaman publik/admin nyata (`app/page.tsx` masih placeholder).
- **Database**: ✅ live di Supabase project **pejastip-handal** (`yvtkbahufhvlvrbamvpj`, region `ap-southeast-1`).
  - Migration `supabase/migrations/20260916000000_init_schema.sql` sudah di-push & diverifikasi: semua tabel + view (`v_order_payment`, `v_customer_balance`) + `check_rate_limit()` + RLS (11 tabel RLS aktif, publik read-only utk katalog, admin `authenticated` full access — simplifikasi single-admin MVP) jalan benar di database nyata.
  - Seed fixture (`supabase/seed.sql`) sudah dimuat — 3 event contoh, 3 buku fiktif, 1 order contoh.
  - RPC bisnis (`create_order`, `submit_payment_proof`, dst — lihat `docs/03-prd.md` §5) **belum dibuat**; tanpa RPC ini, anon tidak bisa menulis apa pun (deny-by-default, sesuai desain).
- **Git**: repo lokal ada (`main`, belum ada commit — belum diminta commit).
- **Deploy**: belum — Cloudflare Pages belum disetup.

## Belum diverifikasi / risiko terbuka

- Belum ada run lokal via Docker (`supabase start`) — verifikasi migration dilakukan langsung di project remote (lihat di atas), bukan lokal. Kalau nanti butuh dev loop lokal, install Docker Desktop dulu.
- `docs/03-prd.md` §9: nama brand sudah ada ("Pejastip Handal"), tapi domain masih belum ditentukan.
- Supabase CLI versi 2.116 — ada v2.117 tersedia, belum diupdate.

## Selanjutnya (urutan dari README §Rencana eksekusi)

1. RPC & halaman admin inti (event, katalog + import CSV, order) — sisa M1.
2. Order form publik + halaman sukses + tracker (M2).
3. Payments (upload+verifikasi) + shipping + customers (M3).
4. Halaman statis + migrasi data + hardening + deploy Cloudflare Pages (M4).
