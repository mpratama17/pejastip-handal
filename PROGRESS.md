# Jastip Buku — Progress

Snapshot status saat ini. Diupdate tiap close-out, ditimpa bukan ditambah.

## Status

- **Dokumen** (`docs/01-05`, `README.md`): ✅ disepakati. Stack: Next.js static export + Supabase (RPC Postgres `security definer` sebagai trust boundary).
- **Identitas visual**: ✅ "Pejastip Handal" (pine/cover/paper/brick, Fraunces/Inter) — `docs/04`. Struktur & alur halaman customer mengikuti blossombooks.id (diamati langsung 2026-09-17), identitas tetap milik sendiri.
- **Database** (project `pejastip-handal`, `yvtkbahufhvlvrbamvpj`, ap-southeast-1): ✅ semua migration di-push dan diuji langsung (REST anon + simulasi role `authenticated`), bukan cuma `db push` sukses.
- **Halaman customer**: ✅ Beranda (hero batch buka + rak terlaris + 4 pintasan + cara kerja), Katalog (pilih batch, cari, tabel/kartu, sisa stok, paginasi), Batch Berjalan, Form Order (5 langkah), Lacak Order (status, resi, riwayat bayar + alasan tolak, upload pelunasan), Form Kirim (kode + WA, gabung/parsial, kurir dari settings, alamat), Request Buku, Cara Order (web vs WhatsApp), S&K (dari settings). Header/footer ala Blossom; mobile dicek di 390px.
- **Halaman admin**: ✅ Dashboard (kartu bisa diklik), Event, Katalog + CSV, Order + detail, **Pembayaran** (pratinjau bukti via signed URL, verifikasi dengan koreksi nominal, tolak wajib alasan), **Pengiriman** (resi/ongkir/layanan, tandai diterima, salin alamat), **Customer** (piutang, riwayat order, catatan, blacklist wajib alasan — ditegakkan constraint DB), **Request Buku**, **Pengaturan** (toko, WA/rekening, kurir, DP default, S&K), **detail order**: edit buku (qty/tambah/hapus, buku yang sudah diproses kirim terkunci, harga lama dipertahankan) + override status per buku (R15/R17) — diuji di browser lalu dikembalikan ke seed.
- **Alur end-to-end yang sudah diuji nyata** (browser + REST, lalu data dikembalikan ke kondisi seed): order → upload bukti (anon) → admin tolak/verifikasi → event "tiba" (cascade) → Form Kirim → admin isi resi → tracker menampilkan resi. Submit ganda Form Kirim ditolak (AC-13).
- **`pnpm build` / `pnpm lint`**: ✅ bersih (22 halaman statis).
- **Git**: https://github.com/mpratama17/pejastip-handal — branch `main`, `ui`, `data`, `dev/backend` (dipakai saat perlu).
- **Deploy**: belum (Cloudflare Pages).

## Perbaikan keamanan yang ditemukan saat pengujian (sudah diperbaiki)

- Rate limit sebelumnya berbagi satu kuota global (`…:unknown`) karena frontend statis tidak mengirim IP → sekarang `request_ip()` dari header `cf-connecting-ip` di server; parameter `p_client_ip` (bisa dipalsukan) dihapus.
- `check_rate_limit`/helper internal bisa dipanggil anon langsung (bisa dipakai memblokir order nomor WA orang lain) → di-revoke. Fungsi admin juga di-revoke eksplisit dari `anon` (Supabase memberi EXECUTE lewat default privileges, bukan hanya PUBLIC).
- Upload bukti anon ke path bebas (bisa mengisi kuota storage) → dibatasi ke folder `{order_id}/` order aktif; tipe file & 5 MB ditegakkan bucket.
- `submit_payment_proof` menolak path bukti di luar folder order sendiri.
- Form Kirim mewajibkan kode **dan** nomor WA yang cocok (kode saja bisa bocor → alamat kiriman bisa dibajak).
- Order form: keranjang dikosongkan saat ganti batch (sebelumnya pasti ditolak server).
- Admin = siapa pun yang login (signup terbuka) → allowlist tabel `admins` + `is_admin()` di semua policy/storage/RPC admin; UI mengeluarkan akun non-admin. Tambah admin: `insert into admins select id from auth.users where email = '…'`.
- View `v_customer_balance`/`v_order_payment` terbaca anon (kode + nama semua customer) → `security_invoker` + revoke anon.
- `create_order` membocorkan kode customer lama ke siapa pun yang tahu nomor WA → kode hanya dikembalikan untuk customer baru.
- **Manual (dashboard):** matikan "Allow new users to sign up" di Supabase Auth.

## Sengaja belum dikerjakan

- Dialog konfirmasi bermerek (masih `window.confirm`); sidebar admin versi mobile.
- Turnstile (butuh domain live di Cloudflare) — M4.
- Backup `pg_dump` + keep-alive GitHub Actions, migrasi data gsheet, deploy Cloudflare Pages — M4.
- Konten settings: WA admin + ShopeePay/GoPay sementara 087766647125 (nama pemilik akun belum dikonfirmasi); `instagram_handle`, `wa_group_link` kosong; S&K final masih draft owner.
- Proyek ini untuk klien (data lama: bit.ly/horangshuji_ordertracking, bit.ly/horangshuji_POPricelist), sementara dijalankan sebagai proyek pribadi.
- Purge otomatis bukti transfer lama (docs/05 §5).

## Catatan pengujian

- Browser pengujian memegang sesi admin (login Google), jadi upload lewat UI berjalan sebagai admin; jalur anon diuji terpisah lewat REST dengan anon key.
- Belum ada dev loop Docker lokal; migration diuji langsung ke project remote.

## Selanjutnya

1. Isi settings asli (WA admin, rekening, grup WA, Instagram, S&K final).
2. M4: Turnstile, backup & keep-alive, migrasi gsheet, deploy Cloudflare Pages + domain.
