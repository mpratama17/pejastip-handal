# Jastip Buku — Progress

Snapshot status saat ini. Diupdate tiap close-out, ditimpa bukan ditambah.

## Status

- **Dokumen** (`docs/01-05`, `README.md`): ✅ disepakati — schema, halaman, PRD, design system, proteksi kuota. Tech stack sempat direvisi total (Next.js server/OpenNext → static export + RPC Postgres + Supabase Edge Functions) setelah second opinion; semua dokumen sudah konsisten dengan arah baru.
- **Identitas visual**: ✅ disepakati — brand "Pejastip Handal", token warna (pine/cover/paper/brick) + tipografi (Fraunces/Inter), lihat `docs/04-design-system.md`.
- **Database**: ✅ live di Supabase project **pejastip-handal** (`yvtkbahufhvlvrbamvpj`, region `ap-southeast-1`).
  - Skema + RLS + view + `check_rate_limit()` (M1), RPC admin (M1), RPC publik order/payment/tracker (M2) — semua di-push dan **diverifikasi langsung ke DB nyata**, bukan cuma `db push` sukses.
  - Storage bucket privat `payment-proofs` (5 MB, jpg/png/webp/pdf) + policy anon-upload/admin-full-access.
- **Kode — M1 admin inti**: ✅ selesai (beberapa dipotong sadar, lihat di bawah).
  - Auth admin: login (email/password + Google OAuth) + guard client-side. **Diverifikasi end-to-end nyata**, termasuk login Google sampai dashboard.
  - `/admin` dashboard, `/admin/events` (create + ubah status via RPC), `/admin/books` (katalog + CSV import), `/admin/orders` + detail (route `?id=`, bukan `[id]` — static export tidak dukung dynamic route tanpa `generateStaticParams`).
- **Kode — M2 order form publik**: ✅ selesai, **diverifikasi end-to-end lewat browser nyata** (bukan cuma build lulus): isi form 5 langkah → order tersimpan di DB → halaman sukses tampil kode+rekening dari `settings` dengan benar → cek `/track` dengan kode itu → data cocok (sisa tagihan, status kirim per buku).
  - `/order`: form 5 langkah (data diri → pilih batch → pilih buku dgn qty stepper & running subtotal → jenis bayar DP/lunas → konfirmasi) → halaman sukses (kode customer, rincian tagihan, rekening, upload bukti, tombol WA prefilled).
  - `/track`: input kode → daftar order aktif dengan StatusChip bayar & kirim, sisa tagihan, catatan admin.
  - RPC: `create_order` (idempotency, normalisasi WA, blacklist check, lock stok dalam transaksi, generate kode Crockford base32), `submit_payment_proof`, `get_tracker`.
  - Upload bukti transfer: klien upload ke Storage dulu, baru RPC catat baris `payments`. **Kompresi gambar di klien (docs/05 §3 Lapisan 5) BELUM diimplementasi** — file besar ditolak oleh limit bucket (5 MB) tapi tanpa resize otomatis dulu.
- **`pnpm build` dan `pnpm lint`**: ✅ lulus bersih di semua halaman (publik + admin).
- **Git**: pushed ke `https://github.com/mpratama17/pejastip-handal`, branch `main`.
- **Deploy**: belum — Cloudflare Pages belum disetup.

## Bug nyata yang ditemukan & diperbaiki sesi ini (proses verifikasi, bukan cuma baca kode)

Ditemukan lewat tes RPC langsung ke REST API (anon key), bukan cuma `db push` sukses:
1. `gen_random_bytes` (pgcrypto) hidup di schema `extensions`, bukan `public` — fungsi dengan `set search_path = public` gagal resolve saat dipanggil via PostgREST.
2. `order_code_seq` collision dengan order_code yang di-hardcode di `seed.sql`.
3. Kolom `status` ambigu di `RETURNING` (nama sama dengan kolom `RETURNS TABLE`).
4. Type mismatch `bigint` vs `integer` (`v_order_payment`) dan enum vs `text` (`payments.status`) di `RETURNS TABLE`.

## Sengaja dipotong dari scope (bukan lupa)

- **Edit item order** (tambah/hapus buku dari order yang sudah ada, R17) — order detail admin read-only untuk item.
- **Dialog konfirmasi custom** (docs/04 §8.2) — batalkan order masih pakai `window.confirm()` native.
- **Sidebar admin mobile** (docs/04 §4: "collapse jadi bottom sheet") — belum ada pola collapse.
- **Toggle blacklist customer** — halaman `/admin/customers` belum dibuat.
- **Kompresi gambar di klien** sebelum upload bukti (docs/05 §3 Lapisan 5).
- **Turnstile** di 3 form publik (docs/05 §3 Lapisan 2) — butuh domain live di Cloudflare, masuk akal ditunda ke M4 hardening.
- **`/catalogue` dan Home (`/`)** sebagai halaman tersendiri — tidak pernah eksplisit disebut di milestone M1-M4 manapun di `docs/03-prd.md` §8 (gap di dokumen asli). Order form saat ini mandiri (fetch event+katalog sendiri), jadi tidak memblokir order end-to-end.

## Belum diverifikasi / risiko terbuka

- Belum ada run lokal via Docker (`supabase start`) — semua verifikasi migration langsung ke project remote.
- `docs/03-prd.md` §9: nama brand sudah ada ("Pejastip Handal"), domain masih belum ditentukan.
- Supabase CLI versi 2.116 — ada v2.117 tersedia, belum diupdate.
- Rate limit RPC (`check_rate_limit`) belum pernah dites sampai benar-benar kena limit (cuma dipanggil beberapa kali saat tes manual).

## Selanjutnya (urutan dari README §Rencana eksekusi)

1. Payments (verifikasi admin) + shipping + customers (M3).
2. Halaman statis + migrasi data + hardening (Turnstile, kompresi klien, backup) + deploy Cloudflare Pages (M4).
