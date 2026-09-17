"use client";

import Link from "next/link";
import { useSiteSettings, waLink } from "@/lib/site-settings";

const WEB_STEPS = [
  { title: "Pilih batch & buku", body: "Buka Katalog, pilih batch yang sedang buka, cari judul yang kamu mau." },
  { title: "Isi Form Order", body: "Data diri, buku & jumlahnya, lalu pilih bayar DP atau lunas." },
  { title: "Transfer & upload bukti", body: "Rekening tujuan dan nominal muncul setelah order. Upload bukti di halaman yang sama, lalu konfirmasi lewat WhatsApp." },
  { title: "Simpan kode pelacakan", body: "Kode ini dipakai di Lacak Order untuk melihat status bayar dan status tiap buku." },
  { title: "Lunasi saat buku tiba", body: "Kami kabari lewat WhatsApp begitu buku sampai di Indonesia. Upload bukti pelunasan di Lacak Order." },
  { title: "Isi Form Kirim", body: "Setelah lunas, isi alamat dan kurir di Form Kirim. Resi muncul di Lacak Order." },
];

export default function HowToOrderPage() {
  const s = useSiteSettings();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Cara order</h1>
      <p className="mt-1 text-sm text-ink-muted">Ada dua jalur, tergantung batch-nya punya katalog atau tidak.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col card p-5">
          <h2 className="font-display text-xl font-bold">Lewat form order</h2>
          <p className="mt-2 flex-1 text-sm text-ink-muted">
            Untuk batch yang punya katalog di web — sebagian besar pre-order penerbit.
          </p>
          <Link
            href="/order"
            className="btn btn-primary press mt-4 px-4 py-2.5 text-center text-sm font-semibold"
          >
            Buka Form Order
          </Link>
        </div>
        <div className="flex flex-col card p-5">
          <h2 className="font-display text-xl font-bold">Lewat WhatsApp</h2>
          <p className="mt-2 flex-1 text-sm text-ink-muted">
            Untuk batch tanpa katalog — misalnya ready stock gudang atau jastip bazar. Sebutkan nama batch-nya saat chat.
          </p>
          {s?.wa_admin_number && (
            <a
              href={waLink(s.wa_admin_number, "Halo Admin, saya mau order untuk batch [nama batch].")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-wa press mt-4 px-4 py-2.5 text-sm"
            >
              Chat Admin
            </a>
          )}
        </div>
      </div>

      <h2 className="mt-12 font-display text-2xl font-bold">Langkah order lewat web</h2>
      <ol className="mt-6 flex flex-col gap-5">
        {WEB_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-ink">
              {i + 1}
            </span>
            <div className="pt-1">
              <p className="font-semibold">{step.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-sm text-ink-muted">
        Dengan order, kamu dianggap sudah membaca{" "}
        <Link href="/terms" className="font-medium text-link hover:underline">
          Syarat &amp; Ketentuan
        </Link>
        .
      </p>
    </div>
  );
}
