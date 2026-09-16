# Design System

Aturan visual tunggal untuk seluruh aplikasi (publik + admin). Tujuannya dua: konsistensi tanpa perlu wireframe per halaman, dan **white-label** — ganti brand = ganti nilai token, bukan sentuh komponen. Implementasi: Tailwind CSS v4 (`@theme`) + shadcn/ui sebagai basis komponen + lucide-react untuk ikon.

## 1. Arah visual

Struktur & pola halaman meniru Blossom Books (disepakati — lihat `02-pages.md`); **warna dan identitas visual TIDAK meniru Blossom**, dibangun sendiri untuk brand "Pejastip Handal". Diputuskan lewat style tile (lihat riwayat keputusan), direview & disetujui.

Metafora inti: **sampul vs. halaman**. Band gelap (`--color-cover`, hijau botol seperti sampul kain buku) dipakai untuk header/hero — chrome orientasi/brand. Konten & formulir duduk di atas kertas hangat (`--color-bg`) — tempat membaca & bertindak. Satu aksen hangat (`--color-accent`, merah-bata) dipakai HEMAT — hanya untuk uang (harga, sisa tagihan) dan CTA utama, supaya saat muncul benar-benar menarik mata.

Bukan marketplace yang ramai — ini toko personal yang dipercaya lewat grup WA, jadi tampilannya tenang, rapi, banyak ruang napas. Mobile-first tanpa kompromi: mayoritas customer membuka dari link WA di ponsel.

Prinsip: (1) kepercayaan ditunjukkan lewat UI status/tracker, bukan diklaim lewat copy; (2) satu aksen hangat, dipakai hemat; (3) serif untuk suara brand, sans untuk tugas; (4) sampul vs. halaman sebagai device layout, bukan dekorasi.

MVP **light mode saja**. Dark mode bukan non-goal permanen, tapi tidak dibangun sebelum ada yang memintanya.

## 2. Token

Semua token adalah CSS custom properties. Komponen hanya boleh memakai token; nilai heksadesimal langsung di komponen = bug review.

### 2.1 Warna inti (brand — layer yang diganti saat white-label)

```css
@theme {
  /* Brand */
  --color-primary:        #2F6355;  /* pine — tombol utama, link, fokus */
  --color-primary-hover:  #244F44;
  --color-primary-soft:   #DCE8E2;  /* latar chip/badge bernuansa brand */
  --color-cover:          #1F4038;  /* hijau botol gelap — band header/hero ("sampul kain") */
  --color-cover-deep:     #152E27;  /* dasar gradient/hover di atas cover */
  --color-accent:         #A8442F;  /* brick — harga, sisa tagihan, CTA utama; dipakai HEMAT */
  --color-accent-soft:    #F2DBD2;

  /* Permukaan */
  --color-bg:             #F1ECDD;  /* "paper" — kertas hangat, latar halaman publik */
  --color-surface:        #FFFFFF;  /* kartu, form, tabel */
  --color-surface-sunken: #E8E1CC;  /* area sekunder, zebra tabel */

  /* Teks */
  --color-ink:            #2B221A;  /* teks utama — coklat gelap, bukan hitam pekat */
  --color-ink-muted:      #6B6257;  /* teks sekunder, label */
  --color-ink-faint:      #9C9285;  /* placeholder, meta */

  /* Garis */
  --color-border:         #DCD4C0;
  --color-border-strong:  #C4BAA0;
}
```

### 2.2 Warna semantik (tidak diganti saat white-label)

```css
  --color-success: #15803D;  --color-success-soft: #DCFCE7;
  --color-warning: #B45309;  --color-warning-soft: #FEF3C7;
  --color-danger:  #B91C1C;  --color-danger-soft:  #FEE2E2;
  --color-info:    #1D4ED8;  --color-info-soft:    #DBEAFE;
```

### 2.3 Mapping warna status — SATU-SATUNYA sumber kebenaran

Chip status adalah elemen yang paling sering dilihat customer dan admin; warnanya tidak boleh berbeda antar halaman.

| Status bayar | Chip |
|---|---|
| `not_paid` | danger-soft / danger |
| `partially_paid` | warning-soft / warning |
| `fully_paid` | success-soft / success |
| `overpaid` | info-soft / info |

| Status kirim (item) | Chip |
|---|---|
| `not_shipped` | surface-sunken / ink-muted |
| `shipped_to_indo` | info-soft / info |
| `arrived_in_indo` | primary-soft / primary |
| `waiting_courier` | warning-soft / warning |
| `shipped` | info-soft / info + ikon truck |
| `delivered` | success-soft / success |

| Status event | Chip |
|---|---|
| `open` | success-soft / success |
| `closed`, `ordered` | warning-soft / warning |
| `shipped_to_indo`, `arrived` | info-soft / info |
| `completed` | surface-sunken / ink-muted |
| `cancelled` | danger-soft / danger |

Implementasi sebagai satu komponen `<StatusChip status={...} />` dengan map terpusat; dilarang mewarnai status secara ad-hoc.

### 2.4 Tipografi

- **Display/heading**: `Fraunces` (serif lunak/optical-size, via `next/font/google`) — bukan serif kontras-tinggi, kesan "wonky"/hangat khas indie, bukan generic display serif. Fallback: Georgia, serif. Italic dipakai sebagai aksen di momen hero (judul batch di Home, kode customer di halaman sukses) — bukan default semua heading.
- **Body & UI**: `Inter`. Fallback: system-ui, sans-serif. Dipilih tetap karena kebutuhan nyata: tabel admin & form padat data butuh kejelasan Inter di ukuran kecil — dipasangkan sengaja dengan Fraunces yang jauh lebih berkarakter supaya kontrasnya terasa disengaja, bukan default yang sama di semua halaman.
- **Angka tabular** (harga, tagihan): Inter dengan `font-variant-numeric: tabular-nums` agar kolom angka rapi.

| Token | Ukuran/berat | Pakai untuk |
|---|---|---|
| `display` | 30px/36, Fraunces 600 (italic di momen hero) | Judul halaman publik |
| `h1` | 24px/32, Fraunces 600 | Judul section besar |
| `h2` | 20px/28, Inter 600 | Judul kartu/section |
| `h3` | 16px/24, Inter 600 | Sub-judul, header tabel |
| `body` | 16px/24, Inter 400 | Teks utama (jangan 14px untuk publik — ponsel) |
| `small` | 14px/20, Inter 400 | Meta, keterangan |
| `caption` | 12px/16, Inter 500 | Label chip, timestamp |

### 2.5 Spacing, radius, elevasi

- Skala spacing 4px: 4/8/12/16/24/32/48/64. Padding kartu: 16 (mobile) / 24 (≥md).
- Radius: `--radius-sm: 8px` (input, chip), `--radius-md: 12px` (kartu, tombol), `--radius-lg: 16px` (modal, hero).
- Bayangan: dua level saja. `shadow-sm` untuk kartu diam, `shadow-md` untuk elemen mengambang (modal, dropdown). Tanpa bayangan dramatis.
- Border 1px `--color-border` adalah pemisah utama; bayangan adalah aksen, bukan struktur.

## 3. Komponen inti & state-nya

Basis shadcn/ui, di-theme lewat token di atas. Daftar ini adalah inventori lengkap MVP — kalau sebuah halaman butuh komponen di luar daftar, pertanyakan dulu halamannya.

| Komponen | Varian | State wajib |
|---|---|---|
| Button | primary, secondary (outline), ghost, destructive, wa (hijau WhatsApp `#25D366`, khusus tombol "Konfirmasi via WA") | default, hover, focus-visible (ring 2px primary), loading (spinner + disabled), disabled |
| Input / Textarea | default | focus, error (border danger + pesan di bawah), disabled |
| Select | default | sama dengan input |
| StatusChip | lihat §2.3 | — |
| Card | default, sunken | — |
| Table | admin | header sticky, zebra `surface-sunken`; **di < md menjadi daftar kartu**, bukan tabel yang discroll horizontal |
| Stepper | order form 5 langkah | current, done (check), upcoming |
| Modal / Dialog | confirm (aksi destruktif wajib konfirmasi + menyebut objeknya: "Batalkan ORD-2601-0042?") | — |
| Toast | success, error | auto-dismiss 5 dtk, error tidak auto-dismiss |
| EmptyState | ikon + 1 kalimat + 1 aksi | dipakai di tracker kosong, tabel kosong, hasil cari kosong |
| Skeleton | baris teks & kartu | semua fetch klien menampilkan skeleton, bukan spinner halaman penuh |
| FileUpload | bukti transfer | idle (drag/tap), preview gambar, uploading (progress), error (sebut batas: jpg/png/webp/pdf ≤ 5 MB) |
| QtyStepper | − angka + | min 1, max = stok |

## 4. Pola layout

- **Publik**: satu kolom, `max-width: 640px`, padding samping 16px. Header ringkas (logo + menu), footer dengan link statis + WA + Instagram.
- **Form panjang (order, shipping)**: satu halaman dengan section bernomor (stepper), tombol submit sticky di bawah pada mobile. Ringkasan tagihan selalu terlihat sebelum submit.
- **Admin**: sidebar kiri (ikon + label, collapse di mobile menjadi bottom sheet), konten `max-width: 1200px`. Setiap halaman admin: judul + aksi primer kanan atas + filter bar + tabel/daftar.
- Touch target minimal 44×44px. Fokus keyboard terlihat di semua elemen interaktif.

## 5. Format & bahasa

- Rupiah: `Rp1.250.000` (tanpa spasi, titik ribuan, tanpa desimal). Satu util `formatIDR()` — dilarang format manual.
- Tanggal: `12 Okt 2026`; dengan jam hanya bila relevan (`12 Okt, 14.30`).
- Nomor WA ditampilkan sebagai `+62 812-xxxx-xxxx`.
- Copy berbahasa Indonesia, sapaan "kamu", kalimat pendek. Pesan error menyebut apa yang salah dan apa yang harus dilakukan ("Nomor WA belum benar. Contoh: 08123456789"), bukan kode error.
- Istilah konsisten: **event** (bukan "batch" di UI publik — pilih satu; keputusan: "Batch" di UI karena lebih akrab di komunitas jastip, `event` hanya nama teknis), **DP**, **pelunasan**, **resi**.

## 6. Aturan white-label

Lapisan yang berganti per tenant, dan hanya lapisan ini:

1. **Token brand** (§2.1) — satu blok CSS.
2. **`settings`** — nama toko, logo, rekening, nomor WA, kurir, teks statis, default DP.
3. **Aset** — logo & favicon.

Semantik (§2.2), mapping status (§2.3), komponen, dan layout **tidak** ikut berganti; itulah yang membuat produk ini tetap satu produk saat dipakai banyak jastiper. Uji white-label sederhana yang harus selalu lulus: ganti §2.1 + settings + logo → aplikasi terlihat seperti toko lain tanpa satu pun perubahan komponen.

## 7. Referensi cepat per halaman (pengganti wireframe)

- **Home**: hero = band `--color-cover` gelap (bukan tagline abstrak) menampilkan langsung batch yang sedang `open` (judul Fraunces italic + ETA + CTA "Lihat Katalog") — hero-nya batch itu sendiri, karena memang itu tugas halaman ini. Di bawahnya (latar `--color-bg`): buku terlaris → langkah cara order bernomor (memang urutan asli, bukan dekorasi) → CTA grup WA.
- **Katalog**: select Batch di atas → search bar → daftar kartu buku (cover kiri 64px, judul + author + format, harga accent kanan, stok bila ready stock) → tombol "Order dari batch ini".
- **Order form**: stepper 5 section (lihat PRD §3.1); ringkasan tagihan sticky sebelum submit.
- **Sukses order**: kartu besar kode customer (font display Fraunces italic, bisa disalin satu tap) → rincian tagihan → rekening (tombol salin) → FileUpload bukti → Button `wa`.
- **Tracker**: input kode di tengah → hasil: header nama + kode, kartu per order (StatusChip bayar + sisa tagihan menonjol dalam `--color-accent`), daftar buku dengan StatusChip kirim masing-masing, catatan admin dalam kartu `sunken`, FileUpload pelunasan, Button `wa`.
- **Shipping**: input kode → daftar checkbox buku eligible (dikelompokkan per order) → kurir (radio) → alamat → ringkasan → submit.
- **Admin dashboard**: 4 stat card (order baru, bukti pending, piutang total, batch aktif) → daftar antrean verifikasi terbaru → daftar order terbaru.
- Halaman admin lain mengikuti pola §4 tanpa kejutan.

## 8. Aturan interaksi UX (dialog, tombol, keramahan)

Prioritas produk: UI ramah dan pengalaman yang jelas. Aturan di bawah mengikat sama kuatnya dengan token warna.

### 8.1 Tombol
- **Satu aksi primer per layar.** Semua aksi lain secondary/ghost. Kalau dua tombol terasa sama penting, hierarki halamannya yang salah — perbaiki halamannya.
- Penempatan konsisten: form publik → tombol primer full-width di bawah (sticky di mobile); dialog → primer kanan, "Batal" kiri; halaman admin → primer kanan-atas.
- Label tombol = kata kerja + objek: "Kirim Order", "Simpan Resi", "Upload Bukti" — tanpa "OK"/"Submit"/"Ya".
- Tombol yang sedang bekerja: spinner + label berubah ("Mengirim…") + disabled; tidak pernah bisa di-double-click.

### 8.2 Dialog & konfirmasi
- Dialog konfirmasi hanya untuk aksi destruktif/tidak bisa dibatalkan (batalkan order, hapus event, blacklist). Aksi biasa tidak perlu dialog — jangan melatih user menekan "Ya" tanpa membaca.
- Isi dialog menyebut objek dan konsekuensinya: "Batalkan ORD-2601-0042 milik Rina? Pembayaran terverifikasi Rp150.000 akan menjadi kredit yang harus kamu selesaikan manual." Tombol destruktif memakai variant danger dan mengulang kata kerjanya ("Ya, batalkan order").
- Sukses aksi kecil → toast; sukses aksi besar (order terkirim) → halaman/panel sukses penuh, bukan toast.

### 8.3 Form yang ramah
- Validasi inline saat blur, bukan menunggu submit; error di bawah field, field pertama yang error di-scroll & difokus.
- Jangan pernah menghilangkan isian user: submit gagal = isian tetap; navigasi balik antar langkah stepper = isian tetap.
- Input WA: keyboard numerik, placeholder "08123456789", normalisasi tampilan otomatis.
- Setiap field yang mungkin membingungkan diberi satu kalimat bantuan di bawah label ("Nomor ini kami pakai untuk konfirmasi order — pastikan aktif").
- Progres terlihat: stepper menunjukkan posisi ("Langkah 3 dari 5"); user tahu berapa lagi.

### 8.4 Menunggu, kosong, gagal
- Loading: skeleton sesuai bentuk konten (jangan spinner layar penuh); operasi > 3 dtk memberi konteks ("Mengunggah bukti… 60%").
- Empty state selalu tiga bagian: ikon ringan + satu kalimat ramah + satu aksi ("Belum ada order aktif. Lihat batch yang sedang buka →").
- Gagal jaringan: pesan + tombol "Coba lagi" di tempat; aman ditekan berkat idempotency (PRD AC-4).
- Setiap dead-end punya pintu keluar: 404 → link Home + Track Order; kode salah → link "Lupa kode? Chat admin".

### 8.5 Bahasa yang menenangkan
- Nada: seperti admin toko yang sabar, bukan sistem. "Ups, nomornya belum lengkap" bukan "Invalid input".
- Jangan menyalahkan user; setiap pesan error memberi jalan keluar dalam kalimat yang sama.
- Konfirmasi uang selalu eksplisit sebelum submit: "Kamu akan membayar DP Rp122.500 dari total Rp350.000".
