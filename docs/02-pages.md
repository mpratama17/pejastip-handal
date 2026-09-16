# Daftar Halaman & Alur

Struktur halaman meniru alur Blossom Books (sudah diverifikasi langsung dari situsnya: order form, shipping form, ongoing orders, track order, book request, how-to-order, terms), dengan beberapa perbaikan kecil yang dicatat eksplisit di bagian akhir. Routing memakai App Router Next.js (static export — tanpa server Node, lihat README §Tech stack; semua logic bisnis di RPC Postgres, `01-database-schema.md` §Model akses).

## Halaman publik

| Route | Nama | Tujuan | Tabel/view utama |
|---|---|---|---|
| `/` | Home | Perkenalan, batch yang sedang `open`, ringkasan cara order, link WA group & Instagram | `events` |
| `/catalogue` | Katalog | Pilih event → cari judul/ISBN → lihat format, harga, stok | `events`, `event_items`, `books` |
| `/ongoing` | Ongoing Orders | Rekap publik semua batch aktif: nama, status, ETA | `events` |
| `/order` | Order Form | Form pemesanan (detail di bawah) | `customers`, `orders`, `order_items`, `payments` |
| `/track` | Track Order | Input kode → status order pribadi | `v_order_payment`, `order_items`, `orders` |
| `/shipping` | Shipping Form | Minta pengiriman untuk buku yang sudah tiba & lunas | `shipments`, `order_items` |
| `/request` | Book Request | Titip cari buku di luar katalog | `book_requests` |
| `/how-to-order` | Cara Order | Statis: langkah order, aturan DP & tenggat per tipe event | `settings` |
| `/terms` | Syarat & Ketentuan | Statis: pembatalan, blacklist, disclaimer kondisi buku impor | `settings` |

### `/order` — Order Form (halaman terpenting)

Lima langkah dalam satu halaman, urutan sama dengan Blossom:

1. **Data diri**: nama, nomor WA (wajib, dinormalisasi ke +62), Instagram (opsional). Jika nomor WA sudah ada di `customers`, order menempel ke customer lama; jika belum, customer baru dibuat dan `code` di-generate.
2. **Pilih event**: dropdown berisi event ber-status `open` **yang punya minimal satu `event_item` aktif** — bukan semua event `open`. Satu order = satu event (aturan Blossom, kita ikuti — menyederhanakan pembelanjaan per batch).
3. **Cari & tambah buku**: search judul/ISBN dalam event terpilih, atur qty, daftar "buku terpilih" dengan subtotal berjalan. Ready stock: qty divalidasi terhadap `stock`.
4. **Jenis pembayaran**: DP (sesuai `dp_percent` event) atau lunas; metode transfer bank / ShopeePay. Nominal DP dihitung dan ditampilkan.
5. **Konfirmasi**: checkbox setuju T&C + paham harga final → submit.

**Setelah submit** (perbaikan atas Blossom, yang membagikan kode via WA manual):
- Halaman sukses menampilkan: `order_code`, **kode customer**, rincian tagihan, nomor rekening (dari `settings`), dan nominal yang harus ditransfer.
- **Upload bukti transfer langsung di halaman ini** → masuk `payments` ber-status `pending`.
- Tombol "Konfirmasi via WhatsApp" dengan `wa.me` prefilled (kode + order_code + nominal), karena grup WA tetap kanal utamamu. Teks tegas ala Blossom: order tanpa konfirmasi tidak diproses.

### `/track` — Track Order

Input kode customer → tampil: nama, daftar order aktif, status bayar (Not/Partially/Fully Paid/Overpaid), **sisa tagihan**, status per buku (6 tahap: not shipped → shipped to Indo → arrived in Indo → waiting courier → shipped → delivered), resi bila ada, catatan admin, tombol WA admin. Juga tempat **upload bukti pelunasan** (masuk antrean verifikasi). Ekspor PDF: fase 2.

### `/shipping` — Shipping Form

Hanya relevan setelah notifikasi tiba + lunas (aturan Blossom). Alur: input kode → "Cek buku" menampilkan hanya item ber-status `arrived_in_indo` milik order yang `fully_paid` → centang buku yang mau dikirim (mendukung kirim parsial & gabung antar-order) → pilih kurir (daftar dari `settings`) → alamat lengkap (provinsi dropdown, kota, kode pos) → submit → terbentuk `shipments` + item terpilih di-assign; status item menjadi `waiting_courier`. Ongkir diisi admin setelah ditimbang, tampil di tracker.

## Halaman admin (`/admin/*`, di balik login)

| Route | Nama | Fungsi inti |
|---|---|---|
| `/admin` | Dashboard | Order baru, antrean bukti transfer `pending`, total piutang (`v_customer_balance`), event aktif |
| `/admin/events` | Event | CRUD event; tombol **bulk update**: satu aksi "Arrived" mengubah `shipping_status` semua item di event itu — pengganti utama kerja gsheet |
| `/admin/books` | Katalog | Master buku + harga/stok per event; **import CSV** (jalur migrasi dari gsheet) |
| `/admin/orders` | Order | List + filter (event, status bayar), detail, edit item, diskon, catatan admin, batalkan |
| `/admin/payments` | Verifikasi | Antrean bukti transfer: lihat gambar (signed URL) → verified / rejected; riwayat per order |
| `/admin/shipments` | Pengiriman | Daftar `shipments` menunggu resi; input resi + ongkir → status item `shipped`; tandai `delivered` |
| `/admin/customers` | Customer | Profil, riwayat order, piutang, toggle blacklist + alasan |
| `/admin/requests` | Book Request | Kelola status permintaan buku |
| `/admin/settings` | Pengaturan | Rekening, nomor WA admin, daftar kurir, default DP per tipe event, teks statis |

### Event tanpa katalog (WA Direct Order — sesuai pola Blossom)

Diverifikasi dari situs asli: Blossom punya dua jalur order, bukan satu. "Website Order Form" untuk PO dengan katalog spesifik; "WhatsApp Direct Order" untuk event tanpa katalog (Ready Stock non-web, Warehouse PO, BBW, Vinted, Waitlist) — order tetap lewat chat WA, bukan form.

Kita ikuti pola ini, tanpa kolom/flag baru: event tipe ini boleh dibuat tanpa `event_items` sama sekali. Efeknya otomatis dari aturan filter di atas — event tanpa item aktif tidak muncul di dropdown `/order`, tapi tetap tampil di `/ongoing` (nama, status, ETA) sebagai info. Order untuk event ini masuk seperti sekarang (chat WA), lalu **admin input manual** lewat `/admin/orders` bila ingin tetap tercatat di sistem (opsional per event, bukan kewajiban).

## Lintas halaman

- **Tanpa login customer.** Identitas = kode (bearer token acak). Konsisten dengan Blossom dan menghilangkan seluruh beban auth/reset-password untuk customer.
- **Template `wa.me`** terpusat (konfirmasi order, konfirmasi bukti, tanya admin dari tracker) agar format pesan seragam dan mudah diubah di `settings`.
- **Mobile-first.** Hampir semua customer datang dari link yang dibagikan di grup WA, jadi dibuka di ponsel.
- **Blacklist enforcement**: submit order dari `customers.is_blacklisted = true` (dicocokkan via nomor WA) ditolak dengan pesan netral.

## Perbaikan yang disengaja terhadap Blossom

1. Kode customer & instruksi bayar tampil **langsung setelah submit** (Blossom mengirimnya manual via WA).
2. **Upload bukti transfer di web** sehingga antrean verifikasi admin berisi gambar yang sudah terlampir di order-nya — tanpa ini, admin tetap memindah-mindahkan screenshot dari WA seperti sekarang.
3. Resi tampil di tracker (Blossom mengirim resi via WA).

## Eksplisit di luar scope MVP (fase 2)

Loyalty program, wishlist board, ekspor PDF tracker, payment gateway (QRIS/VA), notifikasi WA otomatis (via WA Business API), dan opsi "Shopee checkout dengan surcharge". Semuanya sudah punya tempat mendarat di skema tanpa migrasi besar.
