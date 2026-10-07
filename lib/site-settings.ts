"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type BankAccount = { bank: string; account_number: string; holder: string };
export type TermsSection = { title: string; body: string };
// Kirim via checkout Shopee ala Blossom: customer checkout produk nominal di toko
// Shopee (memakai ongkir/voucher Shopee), harga buku tetap lunas lewat transfer,
// lalu nominal dikembalikan dikurangi biaya admin setelah pesanan Shopee selesai.
export type ShopeeCheckout = { link: string; nominal_idr: number; fee_percent: number; fee_flat_idr: number };

export type SiteSettings = {
  store_name: string;
  store_tagline: string;
  store_about: string;
  wa_admin_number: string;
  wa_group_link: string;
  instagram_handle: string;
  bank_accounts: BankAccount[];
  couriers: string[];
  terms: TermsSection[];
  shopee_checkout: ShopeeCheckout;
};

const DEFAULTS: SiteSettings = {
  store_name: "",
  store_tagline: "",
  store_about: "",
  wa_admin_number: "",
  wa_group_link: "",
  instagram_handle: "",
  bank_accounts: [],
  couriers: [],
  terms: [],
  shopee_checkout: { link: "", nominal_idr: 0, fee_percent: 20, fee_flat_idr: 1250 },
};

// Satu fetch per page load, dibagi semua komponen (header, footer, halaman).
let cache: Promise<SiteSettings> | null = null;

function loadSettings(): Promise<SiteSettings> {
  cache ??= Promise.resolve(supabase.from("settings").select("key, value")).then(({ data }) => {
    const merged: Record<string, unknown> = { ...DEFAULTS };
    for (const row of data ?? []) merged[row.key] = row.value;
    return merged as SiteSettings;
  });
  return cache;
}

export function useSiteSettings(): SiteSettings | null {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);
  return settings;
}

export function waLink(number: string, text?: string): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// Opsi kurir mana pun yang namanya memuat "Shopee" = alur checkout Shopee.
export const isShopeeCourier = (courier: string | null | undefined) => /shopee/i.test(courier ?? "");

export const shopeeRefund = (s: ShopeeCheckout) =>
  Math.max(0, s.nominal_idr - Math.ceil((s.nominal_idr * s.fee_percent) / 100) - s.fee_flat_idr);
