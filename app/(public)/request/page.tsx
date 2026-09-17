"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type BookFormat = Database["public"]["Enums"]["book_format"];

const INPUT =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

const EMPTY = { name: "", whatsapp: "", isbn: "", title: "", format: "" as BookFormat | "", notes: "" };

export default function RequestPage() {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTitle, setSentTitle] = useState<string | null>(null);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isbnDigits = form.isbn.replace(/[^0-9Xx]/g, "");
    if (isbnDigits && isbnDigits.length !== 10 && isbnDigits.length !== 13) {
      setError("ISBN harus 10 atau 13 digit. Kosongkan kalau tidak tahu.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.rpc("create_book_request", {
      p_customer_name: form.name,
      p_whatsapp: form.whatsapp,
      p_isbn: form.isbn,
      p_title: form.title,
      p_format: (form.format || null) as BookFormat,
      p_notes: form.notes,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSentTitle(form.title);
    setForm((f) => ({ ...EMPTY, name: f.name, whatsapp: f.whatsapp }));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Request buku</h1>
      <p className="mt-1 text-sm text-ink-muted">Titip cari buku yang belum ada di katalog.</p>

      <div className="mt-6 rounded-lg border border-border bg-surface-sunken p-5 text-sm">
        <p className="font-semibold">Sebelum mengirim request</p>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-ink-muted">
          <li>
            Cari dulu judul atau ISBN-nya di{" "}
            <Link href="/catalogue" className="font-medium text-primary hover:underline">
              katalog
            </Link>{" "}
            — mungkin sudah tersedia.
          </li>
          <li>Pastikan ISBN sesuai format yang kamu mau (paperback/hardcover), bukan audiobook atau ebook.</li>
          <li>Buku dari penerbit independen kecil belum tentu bisa dipesan.</li>
          <li>Satu form untuk satu judul. Kirim lagi untuk judul berikutnya.</li>
          <li>Buku yang berhasil kami temukan akan muncul di katalog batch berikutnya.</li>
        </ul>
      </div>

      {sentTitle && (
        <div className="mt-6 rounded-lg border border-success/30 bg-success-soft p-4 text-sm text-success" role="status">
          Request <span className="font-semibold">{sentTitle}</span> terkirim. Kamu bisa kirim judul lain di bawah.
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Nama
            <input required value={form.name} onChange={set("name")} autoComplete="name" className={INPUT} />
          </label>
          <label className="block text-sm font-medium">
            Nomor WhatsApp
            <input
              required
              inputMode="tel"
              placeholder="08123456789"
              value={form.whatsapp}
              onChange={set("whatsapp")}
              autoComplete="tel"
              className={INPUT}
            />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Judul buku
            <input required value={form.title} onChange={set("title")} className={INPUT} />
          </label>
          <label className="block text-sm font-medium">
            ISBN <span className="font-normal text-ink-faint">(opsional)</span>
            <input inputMode="numeric" placeholder="978…" value={form.isbn} onChange={set("isbn")} className={INPUT} />
          </label>
          <label className="block text-sm font-medium">
            Format
            <select value={form.format} onChange={set("format")} className={INPUT}>
              <option value="">Bebas</option>
              <option value="paperback">Paperback</option>
              <option value="hardcover">Hardcover</option>
            </select>
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            Catatan <span className="font-normal text-ink-faint">(opsional)</span>
            <textarea
              rows={2}
              placeholder="mis. edisi tertentu, sampul tertentu"
              value={form.notes}
              onChange={set("notes")}
              className={INPUT}
            />
          </label>
        </div>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? "Mengirim…" : "Kirim Request"}
        </button>
      </form>
    </div>
  );
}
