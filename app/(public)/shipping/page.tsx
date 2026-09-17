"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/format";
import { useSiteSettings } from "@/lib/site-settings";
import type { Database } from "@/types/database";

type ShippableItem = Database["public"]["Functions"]["get_shippable_items"]["Returns"][number];

const PROVINCES = [
  "Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Bengkulu", "Sumatera Selatan",
  "Kepulauan Bangka Belitung", "Lampung", "Banten", "DKI Jakarta", "Jawa Barat", "Jawa Tengah", "DI Yogyakarta",
  "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat", "Kalimantan Tengah",
  "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Sulawesi Utara", "Gorontalo", "Sulawesi Tengah",
  "Sulawesi Barat", "Sulawesi Selatan", "Sulawesi Tenggara", "Maluku", "Maluku Utara", "Papua", "Papua Barat",
  "Papua Barat Daya", "Papua Selatan", "Papua Tengah", "Papua Pegunungan",
];

const INPUT =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink";

export default function ShippingPage() {
  return (
    <Suspense fallback={null}>
      <ShippingForm />
    </Suspense>
  );
}

function ShippingForm() {
  const settings = useSiteSettings();
  const presetCode = useSearchParams().get("code") ?? "";
  const [code, setCode] = useState(presetCode);
  const [whatsapp, setWhatsapp] = useState("");
  const [items, setItems] = useState<ShippableItem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recipient, setRecipient] = useState({ name: "", phone: "" });
  const [courier, setCourier] = useState("");
  const [address, setAddress] = useState({ street: "", detail: "", province: "", city: "", postal: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  const eligible = useMemo(() => (items ?? []).filter((i) => i.eligible), [items]);
  const waiting = useMemo(() => (items ?? []).filter((i) => !i.eligible), [items]);
  const unpaid = useMemo(() => {
    const byOrder = new Map<string, number>();
    for (const i of waiting) byOrder.set(i.order_code, i.balance_idr);
    return [...byOrder.entries()];
  }, [waiting]);

  async function checkBooks(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setLookupError(null);
    setItems(null);
    const { data, error } = await supabase.rpc("get_shippable_items", { p_code: code, p_whatsapp: whatsapp });
    setChecking(false);
    if (error) return setLookupError(error.code === "P0001" ? error.message : "Gagal memeriksa. Coba lagi.");
    const list = data ?? [];
    setItems(list);
    setSelected(new Set(list.filter((i) => i.eligible).map((i) => i.order_item_id)));
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) return setSubmitError("Pilih minimal satu buku.");
    if (!/^\d{5}$/.test(address.postal)) return setSubmitError("Kode pos harus 5 digit.");
    if (!confirmed) return setSubmitError("Centang konfirmasi alamat dulu.");
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.rpc("create_shipment", {
      p_code: code,
      p_whatsapp: whatsapp,
      p_order_item_ids: [...selected],
      p_recipient_name: recipient.name,
      p_recipient_phone: recipient.phone,
      p_courier: courier,
      p_address_street: address.street,
      p_address_detail: address.detail,
      p_city: address.city,
      p_province: address.province,
      p_postal_code: address.postal,
    });
    setSubmitting(false);
    if (error) return setSubmitError(error.code === "P0001" ? error.message : "Gagal mengirim. Coba lagi.");
    setDone(eligible.filter((i) => selected.has(i.order_item_id)).map((i) => i.title));
    window.scrollTo({ top: 0 });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="card bg-primary p-6 shadow-hard sm:p-8">
          <p className="text-sm text-ink/75">Permintaan kirim tercatat</p>
          <h1 className="mt-1 font-display text-3xl font-bold">{done.length} buku siap dikemas</h1>
          <ul className="mt-4 list-disc pl-5 text-sm text-ink/75">
            {done.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <p className="mt-5 text-sm text-ink-muted">
          Ongkir dihitung setelah paket ditimbang dan dikabari lewat WhatsApp. Nomor resi muncul di Lacak Order begitu paket
          diserahkan ke {courier}.
        </p>
        <Link
          href={`/track?code=${code.trim().toUpperCase()}`}
          className="btn btn-primary press mt-5 inline-block px-5 py-3 text-sm font-semibold"
        >
          Buka Lacak Order
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Form kirim</h1>
      <p className="mt-1 text-sm text-ink-muted">Ajukan pengiriman untuk buku yang sudah tiba.</p>

      <div className="mt-6 rounded-lg border border-ink bg-sky-soft p-5 text-sm">
        <p className="font-semibold">Isi form ini hanya jika</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink-muted">
          <li>kamu sudah dikabari bahwa bukumu tiba di Indonesia, dan</li>
          <li>pembayaran order-nya sudah lunas terverifikasi.</li>
        </ul>
        <p className="mt-2 text-ink-muted">Buku dari beberapa order boleh digabung dalam satu kiriman.</p>
      </div>

      <form onSubmit={checkBooks} className="mt-6 card p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Kode pelacakan
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="VNGB3554"
              className={`${INPUT} uppercase tracking-wider`}
            />
          </label>
          <label className="block text-sm font-medium">
            Nomor WhatsApp saat order
            <input
              required
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="08123456789"
              autoComplete="tel"
              className={INPUT}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-ink-muted">Kode dan nomor WA dicocokkan supaya alamat kiriman tidak bisa diganti orang lain.</p>
        {lookupError && <p className="mt-3 text-sm text-danger">{lookupError}</p>}
        <button
          type="submit"
          disabled={checking}
          className="btn btn-primary press mt-4 w-full px-4 py-2.5 text-sm"
        >
          {checking ? "Memeriksa…" : "Cek Buku"}
        </button>
      </form>

      {items && (
        <form onSubmit={submit} className="mt-4 card p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold">Buku yang bisa dikirim</h2>

          {eligible.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              {items.length === 0
                ? "Belum ada buku yang tiba dan belum dikirim untuk kode ini."
                : "Buku sudah tiba, tapi order-nya belum lunas."}
            </p>
          ) : (
            <ul className="mt-3 divide-y-1 divide-line">
              {eligible.map((i) => (
                <li key={i.order_item_id}>
                  <label className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(i.order_item_id)}
                      onChange={() => toggle(i.order_item_id)}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <span className="flex-1">
                      {i.title} <span className="text-ink-muted">× {i.qty}</span>
                    </span>
                    <span className="text-xs text-ink-faint">{i.order_code}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {unpaid.length > 0 && (
            <div className="mt-3 rounded-md bg-warning-soft p-3 text-sm text-warning">
              {waiting.length} buku sudah tiba tapi belum bisa dikirim. Lunasi dulu:{" "}
              {unpaid.map(([orderCode, bal], idx) => (
                <span key={orderCode}>
                  {idx > 0 && ", "}
                  <span className="font-semibold">{orderCode}</span> ({formatIDR(bal)})
                </span>
              ))}
              .{" "}
              <Link href={`/track?code=${code.trim().toUpperCase()}`} className="font-semibold underline underline-offset-2">
                Upload bukti di Lacak Order
              </Link>
            </div>
          )}

          {eligible.length > 0 && (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Nama penerima
                  <input required value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} autoComplete="name" className={INPUT} />
                </label>
                <label className="block text-sm font-medium">
                  No. HP penerima <span className="font-normal text-ink-faint">(kosong = no. WA di atas)</span>
                  <input inputMode="tel" value={recipient.phone} onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })} className={INPUT} />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  Kurir
                  <select required value={courier} onChange={(e) => setCourier(e.target.value)} className={INPUT}>
                    <option value="">Pilih kurir</option>
                    {settings?.couriers.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  Nama jalan
                  <input required value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} autoComplete="address-line1" className={INPUT} />
                </label>
                <label className="block text-sm font-medium sm:col-span-2">
                  No. rumah, RT/RW, patokan <span className="font-normal text-ink-faint">(opsional)</span>
                  <input value={address.detail} onChange={(e) => setAddress({ ...address, detail: e.target.value })} autoComplete="address-line2" className={INPUT} />
                </label>
                <label className="block text-sm font-medium">
                  Provinsi
                  <select required value={address.province} onChange={(e) => setAddress({ ...address, province: e.target.value })} className={INPUT}>
                    <option value="">Pilih provinsi</option>
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Kota / Kabupaten
                  <input required value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} autoComplete="address-level2" className={INPUT} />
                </label>
                <label className="block text-sm font-medium">
                  Kode pos
                  <input
                    required
                    inputMode="numeric"
                    maxLength={5}
                    value={address.postal}
                    onChange={(e) => setAddress({ ...address, postal: e.target.value.replace(/\D/g, "") })}
                    autoComplete="postal-code"
                    className={`${INPUT} tabular-nums`}
                  />
                </label>
              </div>

              <label className="mt-5 flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                <span>
                  Alamat di atas sudah benar, dan saya sudah membaca{" "}
                  <Link href="/terms" target="_blank" className="font-medium text-link hover:underline">
                    syarat &amp; ketentuan
                  </Link>
                  .
                </span>
              </label>

              {submitError && <p className="mt-3 text-sm text-danger" role="alert">{submitError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary press mt-5 w-full px-4 py-3 text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? "Mengirim…" : `Ajukan Pengiriman (${selected.size} buku)`}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
