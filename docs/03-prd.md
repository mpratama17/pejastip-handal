# PRD — Sistem Order & Tracking Jastip Buku

Dokumen ini merinci perilaku sistem. Skema data ada di `01-database-schema.md`, peta halaman di `02-pages.md`, aturan visual di `04-design-system.md`. Jika ada konflik antar dokumen, PRD ini menang untuk *perilaku*, skema menang untuk *struktur data*.

## 1. Ringkasan

### Masalah
Order masuk lewat chat WhatsApp lalu disalin manual ke Google Sheets: lambat, rawan terlewat, dan status pesanan hanya bisa dijawab dengan membalas chat satu per satu. Kanal Shopee memotong 8–10% + biaya proses + 3% khusus pre-order (2026), menipiskan margin.

### Solusi
Web ramping ala Blossom Books: customer mengisi order form sendiri (data langsung masuk database), membayar via transfer manual (0% potongan), dan memantau statusnya sendiri lewat tracker berbasis kode. Admin bekerja dari dashboard, bukan dari sheet.

### Sasaran terukur (setelah 2–3 batch percobaan)
| Metrik | Sekarang | Target |
|---|---|---|
| Input data order oleh admin | Manual per order | 0 (customer yang input) |
| Pertanyaan "status pesananku?" di WA | Rutin | Turun drastis (jawaban = link tracker) |
| Potongan platform per transaksi | 8–13% (Shopee) | 0% (manual) |
| Piutang DP yang belum tertagih | Dihitung manual | Selalu terlihat di dashboard |

### Non-goals MVP
Shopping cart, login customer, payment gateway, notifikasi WA otomatis, loyalty, wishlist board, multi-tenant. Semua tercatat sebagai fase 2+ dan punya jalur mendarat tanpa migrasi besar.

## 2. Pengguna & peran

| Peran | Akses | Catatan |
|---|---|---|
| **Customer** | Halaman publik, tanpa login; identitas = kode acak | Datang dari link yang dibagikan di grup WA; hampir selalu via ponsel |
| **Admin** | `/admin/*` via Supabase Auth | Satu akun untuk MVP |
| **Tenant lain** (masa depan) | — | Lihat §7 Arah komersialisasi |

## 3. Requirement fungsional

Format: setiap modul berisi requirement (R) dan acceptance criteria (AC). AC ditulis agar bisa dipakai langsung sebagai checklist test saat implementasi.

### 3.1 Order Form (`/order`)

**R1.** Form 5 langkah sesuai `02-pages.md`. Dropdown event menampilkan event `open` yang punya minimal satu `event_item` aktif — event tanpa katalog (ready stock non-web, BBW, dll., lihat `02-pages.md` §"Event tanpa katalog") tidak tampil di form; order untuk tipe ini tetap masuk manual oleh admin, konsisten dengan pola WhatsApp Direct Order di Blossom.

**R2.** Nomor WA dinormalisasi ke E.164 (`08xx` → `+628xx`) sebelum lookup/insert `customers`.

**R3.** Blacklist: jika nomor WA cocok dengan customer `is_blacklisted`, submit ditolak dengan pesan netral ("Order tidak dapat diproses. Hubungi admin.") tanpa menyebut blacklist.

**R4.** Ready stock: validasi qty server-side terhadap stok tersisa (stok − qty terjual dari order non-cancelled). PO (`stock` null): tanpa batas.

**R5.** Submit bersifat idempoten: klien menyertakan idempotency key (UUID digenerate saat halaman dimuat); submit ganda dengan key sama mengembalikan order yang sudah terbentuk, bukan duplikat.

**R6.** Setelah submit sukses: tampilkan `order_code`, kode customer, rincian tagihan, nominal DP/lunas, rekening tujuan (dari `settings`), area upload bukti transfer, dan tombol WA prefilled.

- **AC-1**: Submit ke event yang berubah menjadi `closed` di antara load dan submit → ditolak dengan pesan jelas, tanpa order terbentuk.
- **AC-2**: Dua customer merebut stok terakhir ready stock secara bersamaan → tepat satu yang berhasil (validasi dalam transaksi DB).
- **AC-3**: Nomor `0812…`, `62812…`, `+62812…` untuk orang yang sama → jatuh ke satu record customer.
- **AC-4**: Refresh halaman sukses tidak membuat order kedua.
- **AC-5**: Customer lama (nomor WA dikenal) → order menempel ke record lama; tidak dibuat kode baru, dan kode lama **tidak** ditampilkan (nomor WA bukan rahasia; kode = kunci tracker & Form Kirim) — customer diarahkan memakai kode yang sudah dimiliki atau chat admin. *(Direvisi 2026-09-17 setelah security review.)*
- **AC-6**: Semua qty < 1, harga hasil manipulasi klien, atau `event_item` non-aktif → ditolak server-side; harga selalu diambil dari DB, tidak pernah dari payload klien.

### 3.2 Pembayaran (upload bukti + verifikasi)

**R7.** Upload bukti di halaman sukses order dan di tracker. Batasan file: jpg/png/webp/pdf, maks 5 MB, disimpan di bucket privat; baris `payments` ber-status `pending` dengan nominal yang diklaim customer.

**R8.** Admin memverifikasi di `/admin/payments`: lihat gambar (signed URL ≤ 1 jam), koreksi nominal bila perlu, lalu `verified` atau `rejected` + alasan.

**R9.** Status bayar order selalu hasil hitungan `v_order_payment`; tidak ada tombol "tandai lunas" yang menulis status secara langsung.

- **AC-7**: Bukti `rejected` → tracker menampilkan status ditolak + alasan, dan customer bisa upload ulang.
- **AC-8**: Pembayaran terverifikasi melebihi total → `overpaid` tampil di tracker dan dashboard admin (untuk dikembalikan/dikompensasi manual).
- **AC-9**: File 6 MB atau .heic → ditolak di klien dan di server dengan pesan yang menyebut batasan.

### 3.3 Tracker (`/track`)

**R10.** Input kode → tampil semua order aktif customer: status bayar, sisa tagihan, status per buku, resi (link ke situs kurir bila ada), catatan admin, tombol WA, upload bukti pelunasan.

**R11.** Rate limit lookup: maks 10 percobaan kode/menit/IP; kode salah → pesan generik tanpa membocorkan apakah kode mirip dengan yang ada.

- **AC-10**: Kode valid tanpa order aktif → empty state ramah, bukan error.
- **AC-11**: Sisa tagihan yang tampil = `balance_idr` dari view, konsisten dengan yang dilihat admin.

### 3.4 Shipping Form (`/shipping`)

**R12.** "Cek buku" menampilkan hanya item milik kode tersebut yang `arrived_in_indo` DAN order-nya `fully_paid`. Item dari beberapa order boleh dicentang bersama (gabung kirim).

**R13.** Submit membentuk `shipments`, meng-assign item terpilih, dan mengubah status item ke `waiting_courier`.

- **AC-12**: Order `partially_paid` → itemnya tidak muncul, dengan keterangan "lunasi dulu" + sisa tagihan.
- **AC-13**: Item yang sudah masuk shipment lain tidak muncul lagi.
- **AC-14**: Submit kedua dengan item tersisa → shipment baru terpisah (kirim bergelombang didukung).

### 3.5 Event & bulk update (admin)

**R14.** Perubahan status event menawarkan bulk update item dengan mapping default (bisa dibatalkan per aksi):
| Status event baru | Status item yang di-update | Menjadi |
|---|---|---|
| `shipped_to_indo` | semua `not_shipped` di event | `shipped_to_indo` |
| `arrived` | semua `shipped_to_indo` | `arrived_in_indo` |

Item ber-status lebih maju tidak pernah dimundurkan oleh bulk update.

**R15.** Admin bisa override status per item (kasus: satu buku tertinggal batch-nya).

- **AC-15**: Event 200 item → bulk update satu transaksi, tuntas < 3 detik.
- **AC-16**: Item yang sudah `shipped` tidak berubah saat event di-set `arrived`.

### 3.6 Katalog & import (admin)

**R16.** Import CSV: kolom `isbn,title,author,format,price_idr,stock`. ISBN yang sudah ada di `books` → pakai record lama (tidak duplikat); baris invalid dilaporkan per nomor baris tanpa menggagalkan seluruh file.

- **AC-17**: Import ulang file yang sama → idempoten (tidak ada duplikasi `event_items`).

### 3.7 Order management, customer, request (admin)

**R17.** Order list dengan filter (event, status bayar, status order) + pencarian nama/kode/order_code. Detail order: edit item, diskon + catatan, batalkan (dengan konfirmasi; pembayaran terverifikasi pada order batal tampil sebagai kredit yang harus diselesaikan manual).

**R18.** Halaman customer: riwayat order, total piutang, toggle blacklist + alasan wajib.

**R19.** Book request masuk dengan status `new`; admin menggeser status; tidak ada janji SLA ke customer di UI publik.

## 4. Non-fungsional

**Skala.** Estimasi beban: grup WA berisi ratusan member, order 50–200 per batch, puncak trafik = jam-jam setelah broadcast "PO dibuka". Ini kecil; free tier Supabase dan hosting free tier menanganinya dengan longgar (pilihan hosting & alasannya: `05-quota-abuse-protection.md` §1 — catatan: Vercel Hobby melarang pemakaian komersial). Keputusan arsitektur tidak boleh menambah kompleksitas demi skala yang tidak ada — batas yang harus diwaspadai justru kuota free tier (500 MB DB, 1 GB storage), dipantau dari dashboard Supabase.

**Performa.** Mobile-first; target LCP < 2,5 dtk pada 4G. Katalog di-fetch di klien dari RPC/view publik, di-cache di edge Cloudflare (TTL 60 dtk, lihat `05` §3 Lapisan 1); gambar cover di-lazy-load dan dikompres/diresize sekali saat import/upload (bukan `next/image` — tidak ada server Next untuk image optimization di static export, lihat `05` §3 Lapisan 5).

**Keamanan.**
- RLS deny-by-default; semua akses data via server (service role tidak pernah sampai ke browser).
- Kode customer: ≥ 8 karakter Crockford base32 acak (≥ 40 bit) — bukan sekuensial, karena kode = akses data.
- Rate limit endpoint publik (order 5/menit/IP, track 10/menit/IP).
- Bukti transfer di bucket privat + signed URL pendek; jangan pernah public bucket (isinya berisi nama & nominal orang).
- Validasi semua input server-side; harga & total selalu dihitung ulang di server.

**Reliabilitas.** Free tier Supabase TIDAK menyediakan backup otomatis — backup adalah tanggung jawab kita: pg_dump mingguan via GitHub Actions (detail di `05-quota-abuse-protection.md` §6) + tombol ekspor CSV di admin (orders+payments) sebagai cadangan yang bisa dibuka di spreadsheet — juga berfungsi sebagai jaring pengaman psikologis migrasi dari gsheet. Jika web down, operasi darurat kembali ke WA + catat manual; tidak ada SLA formal.

**Bahasa.** Seluruh UI publik berbahasa Indonesia (Blossom memakai Inggris; pasar kita Indonesia). Semua copy yang mungkin berbeda antar pemilik toko (nama toko, sapaan, T&C, instruksi bayar) tinggal di `settings`, bukan hardcode — lihat §7.

## 5. Kontrak API (RPC Postgres, `security definer`)

Tidak ada server Next.js/route handler (lihat README §Tech stack) — endpoint publik adalah function Postgres `security definer`, dipanggil langsung dari frontend statis lewat `supabase-js .rpc()` dengan anon key. Validasi qty/harga/blacklist/idempotency terjadi di dalam function, dalam satu transaksi; rate-limit dicek di awal function lewat `check_rate_limit()`. Error dikembalikan sebagai exception Postgres dengan kode/pesan custom, di-map ke bentuk seragam `{ error: { code, message } }` di klien.

| RPC / akses | Fungsi | Catatan |
|---|---|---|
| `events`, `event_items`, `books` (select langsung) | Katalog untuk halaman publik & order form | RLS publik read-only, bukan RPC — data tidak sensitif |
| `create_order(...)` | Buat order | Idempotency key wajib (param); qty & harga divalidasi ulang dari `event_items`, tidak pernah dari payload; balasan berisi order_code, kode customer, instruksi bayar |
| `submit_payment_proof(...)` | Klaim pembayaran | File diupload langsung ke Storage (signed upload URL dari Edge Function); RPC ini membuat baris `payments` dan mengaitkannya |
| `get_tracker(code)` | Data tracker | Rate-limited di dalam function |
| `get_shippable_items(code)` | Item yang bisa dikirim | |
| `create_shipment(...)` | Buat shipment | |
| `create_book_request(...)` | Book request | |

Admin: CRUD non-sensitif (lihat/edit event, katalog) lewat RLS langsung untuk authenticated user berklaim admin; aksi sensitif (bulk update, override, hard delete, verifikasi pembayaran) lewat RPC `security definer` yang menurunkan `admin_id` dari `auth.uid()` — lihat `01-database-schema.md` §Model akses.

## 6. Penanganan error & kasus tepi

- **Submit gagal jaringan**: klien retry dengan idempotency key yang sama; pesan "coba lagi" tidak akan menggandakan order (AC-4).
- **Event ditutup / stok habis saat mengisi**: error spesifik per penyebab, form tidak kehilangan isian customer.
- **Storage penuh / upload gagal**: order tetap tersimpan; customer diarahkan kirim bukti via WA sebagai fallback (jalur lama tetap hidup).
- **Kode hilang**: customer minta via WA; admin melihat kode di halaman customer. Tidak ada self-service recovery di MVP (by design — nomor WA bukan rahasia, kode iya).

## 7. Arah komersialisasi (dijual ke jastiper lain)

Keputusan hari ini yang murah tapi menentukan bisa-tidaknya dijual nanti:

1. **Zero hardcode identitas toko.** Nama toko, logo, warna brand, rekening, nomor WA, daftar kurir, teks T&C, default DP — semuanya di `settings` + token tema (lihat `04-design-system.md`). Aplikasi harus bisa berganti "kulit" tanpa menyentuh kode.
2. **Model jual pertama: satu tenant = satu deploy.** Tiap jastiper mendapat Supabase project + site Cloudflare Pages + domain sendiri. Onboarding = clone repo, isi env, isi settings. Kelebihan: isolasi data sempurna, tanpa perubahan kode, bisa dijual segera setelah sistemmu sendiri terbukti; karena frontend statis (tanpa adapter server), tidak ada state Workers (bindings, wrangler.toml per-tenant) yang harus direplikasi tiap onboarding. Kekurangan: onboarding manual (~1 jam/tenant) dan update harus di-redeploy per tenant — dapat diterima sampai ~10 tenant.
3. **Multi-tenant sejati ditunda secara sadar.** `tenant_id` di semua tabel + RLS per tenant + billing + halaman signup adalah proyek tersendiri; membangunnya sekarang berarti membayar kompleksitas untuk pelanggan yang belum ada. **Revisit point**: saat tenant ke-5 masuk atau saat redeploy per tenant mulai menyakitkan, mana yang lebih dulu.
4. Konsekuensi praktis untuk implementasi MVP: jangan pernah menulis "Jastip Yoga"/nomor rekening/warna di komponen; selalu baca dari `settings`/token. Ini aturan review kode nomor satu.

## 8. Milestone

| # | Deliverable | Definition of done |
|---|---|---|
| M1 | Skema + seed + admin inti (events, katalog+import, orders) | Admin bisa membuat event & katalog dari CSV gsheet |
| M2 | Order form + halaman sukses + tracker | Order end-to-end masuk DB; AC-1…AC-6, AC-10, AC-11 lulus |
| M3 | Payments (upload+verifikasi) + shipping + customers | AC-7…AC-9, AC-12…AC-14 lulus; piutang tampil di dashboard |
| M4 | Halaman statis + migrasi data + hardening (rate limit, backup) | Batch percobaan nyata berjalan penuh di web |

Launch = jalankan satu batch PO kecil di web paralel dengan proses lama; gsheet baru dipensiunkan setelah batch itu selesai tanpa insiden.

## 9. Risiko & pertanyaan terbuka

| Risiko | Mitigasi |
|---|---|
| Customer lama enggan pindah dari chat ke form | Form dibuat lebih cepat daripada chat (≤ 2 menit); admin tetap menerima order via WA selama transisi dan menginputkannya lewat admin |
| Fee kategori buku Shopee belum terverifikasi | Cek Seller Centre sebelum memutuskan urutan exit |
| Kuota free tier terlampaui (storage bukti transfer) | Kompres gambar di klien sebelum upload; pantau bulanan |
| Nama brand & domain belum ditentukan | Tidak memblokir build (white-label by design); putuskan sebelum M4 |
