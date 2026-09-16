# Jastip Buku — Sistem Order & Tracking

Web olshop ramping untuk bisnis jastip buku: katalog per batch/event, order form, verifikasi pembayaran manual, tracker berbasis kode customer, dan dashboard admin pengganti Google Sheets. Alur mengacu pada blossombooks.id (jastip buku dengan model serupa), disesuaikan dengan workflow WhatsApp-group yang sudah berjalan.

## Keputusan produk (disepakati Sep 2026)

1. **Model ala Blossom**: penjualan per event/PO + order form + tracker; tanpa shopping cart.
2. **Pembayaran manual dulu** (transfer bank / ShopeePay + upload bukti, 0% potongan); gateway QRIS/VA (Midtrans/Xendit, ~0,7% / Rp4.000 flat) menyusul saat volume membenarkan.
3. **Murni alat bisnis** — prioritas: cepat jadi, biaya berjalan ≈ hanya domain, mudah dirawat sendirian.
4. **Shopee ditinggalkan bertahap**, tapi baru setelah web terbukti 2–3 batch PO; produk PO ditarik lebih dulu (tambahan fee pre-order 3% mulai Jan 2026), ready stock terakhir. Verifikasi dulu fee kategori buku di Seller Centre.
5. **White-label sejak awal** — rencana menjual sistem ke jastiper lain bila terbukti sukses. Model jual pertama: satu tenant = satu deploy (Supabase + Cloudflare Pages + domain sendiri); multi-tenant sejati ditunda sadar (revisit di tenant ke-5). Konsekuensi: nol hardcode identitas toko, semua via `settings` + token tema.
6. **Manajemen customer secukupnya**: satu customer satu record, riwayat order, piutang otomatis. Bukan CRM.

## Tech stack

- **Next.js (TypeScript, App Router, static export)** — frontend statis saja, tanpa server Node. Ditolak eksplisit: Next.js server/OpenNext adapter — app ini tidak butuh SSR/ISR (traffic dari link WA, bukan SEO), jadi adapter yang belum teruji untuk fitur yang tidak dipakai adalah risiko tanpa manfaat (second opinion Sep 2026, detail di `docs/05` §1).
- **Supabase** — Postgres (trust boundary utama: RPC `security definer`, bukan server route — lihat `docs/01` §Model akses), Auth (admin saja), Storage (bukti transfer, bucket privat), Edge Functions (Deno, hanya untuk logic yang butuh panggilan HTTP keluar, mis. verifikasi Turnstile)
- **Cloudflare Pages** — hosting statis + CDN + WAF + Turnstile; free tier mengizinkan komersial (Vercel Hobby tidak — lihat `docs/05` §1)
- Biaya berjalan: domain saja (±Rp50–250rb/tahun)

## Dokumen

| File | Isi | Status |
|---|---|---|
| `docs/01-database-schema.md` | Skema Postgres lengkap: DDL, ERD, model akses, rencana migrasi gsheet | ✅ Draft untuk review |
| `docs/02-pages.md` | Halaman publik + admin, alur per halaman, scope MVP vs fase 2 | ✅ Draft untuk review |
| `docs/03-prd.md` | PRD: requirement + acceptance criteria per modul, non-fungsional, API, milestone, arah white-label | ✅ Draft untuk review |
| `docs/04-design-system.md` | Design system: token, komponen + state, mapping warna status, aturan white-label, referensi layout per halaman (pengganti wireframe) | ✅ Draft untuk review |
| `docs/05-quota-abuse-protection.md` | Proteksi kuota free tier + anti-spam: rate limit berlapis, koreksi hosting, retensi, keep-alive, backup | ✅ Draft untuk review |
| `.claude/agents/` | 4 agent on-demand untuk sesi Claude Code: `security-auditor`, `code-reviewer`, `uiux-reviewer`, `bug-hunter` — hanya berjalan saat diperintah | ✅ Siap dipakai |

## Scope MVP

Katalog per event · order form 5 langkah · upload bukti transfer · tracker kode · shipping form (kirim parsial + gabung order) · book request · dashboard admin (event, katalog + import CSV, order, verifikasi pembayaran, pengiriman, customer + blacklist, settings) · halaman statis (cara order, S&K).

**Fase 2**: loyalty program, wishlist board, ekspor PDF, payment gateway, notifikasi WA otomatis, opsi Shopee-checkout ber-surcharge.

## Rencana eksekusi

Dokumen di folder ini adalah sumber kebenaran; implementasi dilakukan di Claude Code dengan membaca `docs/` secara berurutan. Urutan build yang disarankan: skema DB + seed → admin (event, katalog, order) → order form publik → tracker → payments → shipping → halaman statis → migrasi data gsheet.
