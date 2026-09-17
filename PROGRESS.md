# Jastip Buku — Progress

Snapshot status saat ini. Diupdate tiap close-out, ditimpa bukan ditambah.

## Status

- **Dokumen** (`docs/01-05`, `README.md`): ✅ disepakati — schema, halaman, PRD, design system, proteksi kuota. Tech stack sempat direvisi total (Next.js server/OpenNext → static export + RPC Postgres + Supabase Edge Functions) setelah second opinion; semua dokumen sudah konsisten dengan arah baru.
- **Identitas visual**: ✅ disepakati — brand "Pejastip Handal", token warna (pine/cover/paper/brick) + tipografi (Fraunces/Inter), lihat `docs/04-design-system.md`.
- **Database**: ✅ live di Supabase project **pejastip-handal** (`yvtkbahufhvlvrbamvpj`, region `ap-southeast-1`).
  - Skema + RLS + view + `check_rate_limit()` terverifikasi di DB nyata (lihat migration `20260916000000`).
  - RPC admin (`admin_set_event_status` — bulk cascade R14/R15, `import_catalog_csv` — R16) sudah di-push, migration `20260917000000_admin_rpc.sql`.
  - RPC publik untuk order form (`create_order`, `submit_payment_proof`, `get_tracker`, dst) **belum dibuat** — itu milestone M2.
- **Kode — M1 admin inti**: 🚧 sebagian besar selesai, beberapa dipotong sadar (lihat di bawah).
  - Auth admin: login (`/admin/login`) + guard client-side (`app/admin/layout.tsx` — static export tidak punya middleware, jadi guard jalan di klien via `onAuthStateChange`). **Diverifikasi jalan nyata**: redirect otomatis ke login saat belum auth, dan percobaan login salah menampilkan error dari Supabase Auth beneran (bukan mock) — lihat screenshot sesi ini.
  - `/admin` dashboard: 4 stat card + order terbaru.
  - `/admin/events`: list + create + ubah status (lewat RPC, bukan update langsung, supaya cascade R14 jalan).
  - `/admin/books`: katalog per event + tambah manual + **import CSV** (parser CSV naif — lihat `ponytail:` comment di `lib/csv.ts`, tanpa dukungan koma-dalam-kutip).
  - `/admin/orders` + `/admin/orders/detail` (route pakai query-string `?id=`, BUKAN `[id]` dynamic segment — static export tidak support dynamic route tanpa `generateStaticParams`, baru ketahuan dari docs Next.js 16 built-in): list+filter+search, detail dengan diskon/catatan admin, batalkan order (native `confirm()`, bukan dialog custom — lihat catatan di bawah).
  - Belum ada akun admin asli (user memilih skip pembuatan akun sesi ini) — login end-to-end dengan kredensial valid belum pernah dites, cuma jalur error yang terverifikasi.
- **`pnpm build` dan `pnpm lint`**: ✅ lulus bersih (`react-hooks/set-state-in-effect` dimatikan project-wide di `eslint.config.mjs` — pola fetch-on-mount memang standar di sini, bukan anti-pattern, karena arsitekturnya sengaja tanpa data-fetching library).
- **Git**: 2 commit di `main` (scaffold awal, belum termasuk kerja admin sesi ini — belum diminta commit).
- **Deploy**: belum — Cloudflare Pages belum disetup.

## Sengaja dipotong dari scope M1 (bukan lupa)

- **Edit item order** (tambah/hapus buku dari order yang sudah ada, R17) — belum ada UI. Order detail sekarang read-only untuk item.
- **Dialog konfirmasi custom** (docs/04 §8.2) — batalkan order masih pakai `window.confirm()` native, bukan modal bermerek dengan styling token.
- **Sidebar admin mobile** (docs/04 §4: "collapse jadi bottom sheet") — sekarang sidebar selalu tampil apa adanya, belum ada pola collapse/bottom-sheet.
- **Toggle blacklist customer** — halaman `/admin/customers` belum dibuat sama sekali.

## Belum diverifikasi / risiko terbuka

- Belum ada akun Supabase Auth admin — flow login-sukses belum pernah dites nyata.
- Belum ada run lokal via Docker (`supabase start`) — semua verifikasi migration langsung ke project remote. Kalau nanti butuh dev loop lokal, install Docker Desktop dulu.
- `docs/03-prd.md` §9: nama brand sudah ada ("Pejastip Handal"), domain masih belum ditentukan.
- Supabase CLI versi 2.116 — ada v2.117 tersedia, belum diupdate.

## Selanjutnya (urutan dari README §Rencana eksekusi)

1. Buat akun admin asli + verifikasi login sukses end-to-end.
2. Order form publik + halaman sukses + tracker (M2) — butuh RPC publik baru.
3. Payments (upload+verifikasi) + shipping + customers (M3).
4. Halaman statis + migrasi data + hardening + deploy Cloudflare Pages (M4).
