# Proteksi Kuota & Anti-Spam

Sistem ini berjalan di layanan gratis, dan layanan gratis punya dua musuh: penyalahgunaan (spam, brute force) dan pemakaian wajar yang diam-diam melewati kuota. Dokumen ini mendefinisikan pertahanan berlapis + anggaran kuota. Angka batas free tier di bawah diverifikasi per Sep 2026 dari dokumentasi/ulasan resmi — cek ulang saat implementasi karena bisa berubah.

## 1. Temuan penting: hosting (KOREKSI kedua — riwayat: Vercel Hobby ditolak, lalu OpenNext ditolak)

**Vercel Hobby melarang pemakaian komersial.** Dokumen resmi Vercel: "the Hobby plan restricts users to non-commercial, personal use only" (fair use guidelines). Toko jastip = komersial. Berjalan diam-diam di Hobby berisiko akun dibekukan justru saat batch PO sedang berjalan.

Opsi, dengan trade-off:

| Opsi | Biaya | Catatan |
|---|---|---|
| **A. Cloudflare Pages, frontend statis** — DIPUTUSKAN | Rp0 | Free tier Cloudflare mengizinkan komersial; hosting statis tidak kena batas request Workers. Tanpa adapter server — app ini (form + tracker) tidak butuh SSR/ISR sama sekali (traffic dari link WA, bukan SEO). Logic bisnis pindah ke RPC Postgres `security definer` + Supabase Edge Function untuk panggilan HTTP keluar (lihat `01-database-schema.md` §Model akses). `next/image` diganti kompresi/resize di klien saat upload/import (§3 Lapisan 5 di dokumen ini) |
| B. Cloudflare Workers via OpenNext | Rp0 | **Ditolak** (second opinion, Sep 2026): adapter SSR belum pernah dicoba, dipilih untuk fitur (SSR/ISR) yang app ini tidak butuh — risiko setup tanpa manfaat yang sepadan |
| C. Vercel Pro | $20/bln (~Rp330rb) | DX terbaik, tapi biaya tetap yang menggerus margin justru di fase awal |
| D. VPS murah + Coolify | ~Rp80–120rb/bln | Kontrol penuh, tapi kamu jadi sysadmin (patch, monitoring, uptime) |

Keputusan: **A**. Bonus besar: domain di Cloudflare otomatis mendapat CDN, WAF, dan Turnstile dari ekosistem yang sama (lapisan 1–2 di bawah). Efek samping positif untuk arah white-label (`03-prd.md` §7): clone per tenant = clone project Supabase + clone site Cloudflare Pages + isi `settings`, tanpa state adapter Workers yang harus direplikasi tiap onboarding.

Supabase tetap: free tier tidak melarang komersial.

## 2. Anggaran kuota (angka terverifikasi Sep 2026)

| Layanan | Batas free | Perkiraan pemakaian kita | Margin |
|---|---|---|---|
| Supabase DB | 500 MB | Ribuan order = puluhan MB | Aman bertahun-tahun |
| Supabase Storage | 1 GB | Bukti transfer ~200 KB × ±400 file/batch ≈ 80 MB/batch | ±12 batch → perlu kebijakan purge (§5) |
| Supabase egress | 5 GB/bln (db) + 5 GB (cached) | Tracker & katalog kecil; terbesar: gambar | Cover buku via CDN Cloudflare (asset statis), bukti hanya untuk admin; katalog dipanggil langsung ke Supabase (PostgREST) dari klien — verifikasi saat implementasi apakah perlu cache tambahan di klien (stale-while-revalidate) kalau egress mendekati batas |
| Supabase pause | **Paus setelah 1 minggu tidak aktif** | Trafik nyata biasanya cukup | Tetap pasang ping (§6) |
| Cloudflare Pages | Request/bandwidth statis praktis tanpa batas keras; 500 build/bulan | Ratusan–ribuan pageview/hari, build jarang | Sangat aman |
| Supabase Edge Functions | Verifikasi saat implementasi (kuota berubah-ubah) | Dipakai jarang — hanya verifikasi Turnstile & signed upload URL | Beban sangat kecil, tidak ada endpoint publik bervolume tinggi yang lewat sini |
| Supabase backup | **TIDAK ADA di free tier** | — | Wajib backup sendiri (§6) — mengoreksi klaim "backup bawaan" di PRD |

## 3. Pertahanan berlapis terhadap spam/abuse

**Lapisan 1 — Edge (Cloudflare, gratis):** WAF managed rules + Bot Fight Mode aktif; cache aset statis & halaman katalog (TTL 60 dtk) sehingga serbuan refresh tidak menyentuh Supabase.

**Lapisan 2 — Tantangan manusia:** Cloudflare **Turnstile** (gratis, mode invisible — tanpa teka-teki gambar, selaras dengan prinsip UX ramah) pada 3 form tulis publik: order, book request, upload bukti. Token diverifikasi di Supabase Edge Function (satu-satunya alasan Edge Function dipakai untuk jalur ini — RPC Postgres tidak bisa memanggil API Turnstile keluar), yang baru memanggil RPC penulis data setelah token valid.

**Lapisan 3 — Rate limit aplikasi (portable, di Postgres):** satu fungsi `check_rate_limit(bucket_key, max_hits, window_seconds)` berbasis tabel `rate_limits` + index TTL, dipanggil di awal tiap RPC penulis data sebelum logic lain jalan. Dipilih Postgres, bukan Redis/Upstash, agar tidak menambah layanan ketiga dan tetap berjalan di hosting mana pun. Skala kita (puluhan request/menit saat puncak) jauh di bawah titik di mana pendekatan ini jadi bottleneck.

| RPC / akses | Kunci | Batas |
|---|---|---|
| `create_order()` | IP dan nomor WA | 5/menit/IP; 3/jam/nomor WA |
| `get_tracker(code)` | IP | 10/menit; backoff progresif setelah 3 kode salah beruntun |
| `submit_payment_proof()` | kode customer | 5 upload/jam/kode; maks 10 file per order |
| `create_book_request()` | IP | 3/jam |
| Katalog (`select` publik read-only) | — | Dilindungi cache edge, tanpa limiter |

Identifikasi IP: PostgREST meneruskan header request sebagai GUC `request.headers`, dibaca di RPC via `current_setting('request.headers', true)::json ->> 'cf-connecting-ip'`; percayai HANYA header dari edge yang kita kontrol (Cloudflare di depan Supabase) — `x-forwarded-for` mentah bisa dipalsukan.

**Lapisan 4 — Aturan domain (paling murah, paling efektif):** upload bukti hanya diterima untuk kode+order valid; qty dibatasi stok; order dari nomor blacklist ditolak; file dibatasi jenis (cek magic bytes) & ukuran ≤ 5 MB, divalidasi di RPC/Edge Function — tidak pernah dipercaya dari klien.

**Lapisan 5 — Kompresi di klien:** semua bukti transfer dikompres di browser (canvas → WebP, sisi terpanjang 1500 px, target ≤ 200 KB) SEBELUM upload. Screenshot ponsel 3–8 MB → 10–40× penghematan storage dan egress. Cover buku disimpan sebagai thumbnail ≤ 50 KB.

## 4. Brute force kode customer (hitungan eksplisit)

Kode: 8 karakter Crockford base32 = 32^8 ≈ 1,1 × 10^12 kombinasi. Dengan rate limit 10 percobaan/menit/IP, satu IP butuh rata-rata ratusan ribu tahun untuk menemukan satu kode valid. Penyerang dengan 1.000 IP tetap butuh ratusan tahun. Kesimpulan: 8 karakter + limiter cukup; yang dilarang adalah menurunkan entropi (kode urut, kode dari nomor WA) atau membocorkan "kode hampir benar" lewat pesan error.

## 5. Kebijakan retensi (penjaga kuota storage)

- Bukti transfer order yang sudah `completed` > 6 bulan: diekspor ke arsip backup (§6) lalu dihapus dari bucket. Otomatis via cron bulanan; angka pembersihan tampil di dashboard admin.
- Baris `rate_limits` kedaluwarsa dibersihkan harian (pg_cron Supabase).

## 6. Keep-alive & backup (keduanya wajib, keduanya gratis)

- **Keep-alive**: GitHub Actions cron tiap 3 hari memanggil Supabase langsung (query ringan lewat REST/RPC — tidak ada `/api/health` karena tidak ada server Next.js) → proyek Supabase tidak pernah dianggap idle 1 minggu. Sekaligus uptime check. Cron GitHub Actions bisa diam-diam skip/delay jalan (second opinion Sep 2026) — jangan percaya 100%; ritual bulanan di §7 adalah fallback manual untuk ketahuan kalau ini gagal.
- **Backup**: free tier Supabase TIDAK punya backup otomatis. GitHub Actions mingguan menjalankan `pg_dump` → simpan terenkripsi sebagai artifact/repo privat (retensi 8 minggu) + salinan bulanan bukti transfer bucket. Tombol ekspor CSV di admin tetap ada sebagai jalur manual. **Restore dilatih sekali sebelum launch** — backup yang belum pernah di-restore dianggap tidak ada.

## 7. Monitoring bulanan (ritual 10 menit)

Checklist tanggal 1: dashboard Supabase (ukuran DB, storage, egress) → dashboard Cloudflare (request, ancaman terblokir) → jalankan restore-test backup terakhir tiap 3 bulan. Ambang eskalasi: storage > 700 MB atau egress > 3,5 GB dua bulan berturut-turut → evaluasi purge lebih agresif atau naik ke Supabase Pro ($25/bln) sebagai keputusan sadar, bukan kejutan.
