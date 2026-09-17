"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import type { BankAccount, TermsSection } from "@/lib/site-settings";
import type { Database, Json } from "@/types/database";

type EventType = Database["public"]["Enums"]["event_type"];

type Form = {
  store_name: string;
  store_tagline: string;
  store_about: string;
  instagram_handle: string;
  wa_group_link: string;
  wa_admin_number: string;
  bank_accounts: BankAccount[];
  couriers: string[];
  default_dp_percent: Record<EventType, number>;
  terms: TermsSection[];
};

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABEL) as EventType[];

const inputCls =
  "mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30";

const inlineInputCls = inputCls.replace("mt-1 ", "");

// 08xx / 628xx / +628xx → +628xx (format yang sama dengan normalize_whatsapp di DB)
function normalizeWa(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.startsWith("0")) return `+62${d.slice(1)}`;
  if (d.startsWith("62")) return `+${d}`;
  return d ? `+${d}` : "";
}

export default function AdminSettingsPage() {
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    supabase
      .from("settings")
      .select("key, value")
      .then(({ data, error }) => {
        if (error) return setLoadError(true);
        const v = Object.fromEntries((data ?? []).map((r) => [r.key, r.value])) as Record<string, unknown>;
        const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
        setForm({
          store_name: str("store_name"),
          store_tagline: str("store_tagline"),
          store_about: str("store_about"),
          instagram_handle: str("instagram_handle"),
          wa_group_link: str("wa_group_link"),
          wa_admin_number: str("wa_admin_number"),
          bank_accounts: (v.bank_accounts as BankAccount[]) ?? [],
          couriers: (v.couriers as string[]) ?? [],
          default_dp_percent: (v.default_dp_percent as Record<EventType, number>) ?? ({} as Record<EventType, number>),
          terms: (v.terms as TermsSection[]) ?? [],
        });
      });
  }, []);

  if (loadError) return <p className="text-sm text-danger">Pengaturan gagal dimuat. Muat ulang halaman.</p>;
  if (!form) return <p className="text-sm text-ink-muted">Memuat…</p>;

  const set = <K extends keyof Form>(k: K, val: Form[K]) => setForm({ ...form, [k]: val });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-xl font-semibold text-ink">Pengaturan</h1>
      <p className="mt-1 text-sm text-ink-muted">Semua yang tampil ke customer. Tiap bagian disimpan sendiri-sendiri.</p>

      <Section
        title="Identitas toko"
        form={form}
        keys={["store_name", "store_tagline", "store_about", "instagram_handle", "wa_group_link"]}
        validate={(f) => (!f.store_name.trim() ? "Nama toko wajib diisi." : null)}
      >
        <Field label="Nama toko">
          <input value={form.store_name} onChange={(e) => set("store_name", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Tagline" hint="Tampil di atas hero beranda.">
          <input value={form.store_tagline} onChange={(e) => set("store_tagline", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Tentang toko" hint="Tampil di footer.">
          <textarea rows={3} value={form.store_about} onChange={(e) => set("store_about", e.target.value)} className={inputCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram" hint="Tanpa @. Kosongkan kalau belum ada.">
            <input
              value={form.instagram_handle}
              onChange={(e) => set("instagram_handle", e.target.value.replace(/^@/, "").trim())}
              className={inputCls}
            />
          </Field>
          <Field label="Link grup WhatsApp" hint="https://chat.whatsapp.com/…">
            <input type="url" value={form.wa_group_link} onChange={(e) => set("wa_group_link", e.target.value.trim())} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section
        title="Kontak & pembayaran"
        form={form}
        keys={["wa_admin_number", "bank_accounts"]}
        prepare={(f) => ({ ...f, wa_admin_number: normalizeWa(f.wa_admin_number) })}
        validate={(f) => {
          if (!/^\+62\d{8,13}$/.test(normalizeWa(f.wa_admin_number))) return "Nomor WA admin tidak valid.";
          if (f.bank_accounts.length === 0) return "Minimal satu rekening/e-wallet.";
          if (f.bank_accounts.some((b) => !b.bank.trim() || !b.account_number.trim() || !b.holder.trim()))
            return "Lengkapi semua kolom rekening.";
          return null;
        }}
      >
        <Field label="Nomor WhatsApp admin" hint="Tujuan tombol konfirmasi & chat admin.">
          <input
            inputMode="tel"
            value={form.wa_admin_number}
            onChange={(e) => set("wa_admin_number", e.target.value)}
            onBlur={(e) => set("wa_admin_number", normalizeWa(e.target.value))}
            className={inputCls}
          />
        </Field>
        <div>
          <p className="text-sm font-medium text-ink">Rekening / e-wallet</p>
          <div className="mt-2 flex flex-col gap-2">
            {form.bank_accounts.map((b, i) => {
              const upd = (patch: Partial<BankAccount>) =>
                set("bank_accounts", form.bank_accounts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="grid grid-cols-[1fr_1.3fr_1.3fr_auto] items-end gap-2">
                  <input aria-label="Bank" placeholder="BCA / GoPay" value={b.bank} onChange={(e) => upd({ bank: e.target.value })} className={inputCls} />
                  <input aria-label="Nomor" placeholder="Nomor" value={b.account_number} onChange={(e) => upd({ account_number: e.target.value })} className={`${inputCls} tabular-nums`} />
                  <input aria-label="Atas nama" placeholder="Atas nama" value={b.holder} onChange={(e) => upd({ holder: e.target.value })} className={inputCls} />
                  <RemoveButton onClick={() => set("bank_accounts", form.bank_accounts.filter((_, j) => j !== i))} />
                </div>
              );
            })}
          </div>
          <AddButton onClick={() => set("bank_accounts", [...form.bank_accounts, { bank: "", account_number: "", holder: form.store_name }])}>
            Tambah rekening
          </AddButton>
        </div>
      </Section>

      <Section
        title="Kurir"
        form={form}
        keys={["couriers"]}
        prepare={(f) => ({ ...f, couriers: f.couriers.map((c) => c.trim()).filter(Boolean) })}
        validate={(f) => (f.couriers.every((c) => !c.trim()) ? "Minimal satu kurir." : null)}
      >
        <p className="text-sm text-ink-muted">Pilihan kurir di Form Kirim.</p>
        <div className="flex flex-wrap gap-2">
          {form.couriers.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                aria-label={`Kurir ${i + 1}`}
                value={c}
                onChange={(e) => set("couriers", form.couriers.map((x, j) => (j === i ? e.target.value : x)))}
                className={`${inlineInputCls} w-32`}
              />
              <RemoveButton onClick={() => set("couriers", form.couriers.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
        <AddButton onClick={() => set("couriers", [...form.couriers, ""])}>Tambah kurir</AddButton>
      </Section>

      <Section
        title="DP default per tipe batch"
        form={form}
        keys={["default_dp_percent"]}
        validate={(f) =>
          EVENT_TYPES.some((t) => !(f.default_dp_percent[t] >= 0 && f.default_dp_percent[t] <= 100)) ? "DP harus 0–100%." : null
        }
      >
        <p className="text-sm text-ink-muted">Terisi otomatis saat membuat batch baru; tetap bisa diubah per batch.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {EVENT_TYPES.map((t) => (
            <Field key={t} label={EVENT_TYPE_LABEL[t]}>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.default_dp_percent[t] ?? ""}
                  onChange={(e) =>
                    set("default_dp_percent", { ...form.default_dp_percent, [t]: e.target.value === "" ? NaN : Number(e.target.value) })
                  }
                  className={`${inputCls} pr-7 tabular-nums`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm text-ink-faint">%</span>
              </div>
            </Field>
          ))}
        </div>
      </Section>

      <Section
        title="Syarat & ketentuan"
        form={form}
        keys={["terms"]}
        validate={(f) => (f.terms.some((s) => !s.title.trim() || !s.body.trim()) ? "Setiap bagian S&K butuh judul dan isi." : null)}
      >
        <p className="text-sm text-ink-muted">Tampil di halaman S&K sesuai urutan di bawah. Baris baru di isi tampil apa adanya.</p>
        <ol className="flex flex-col gap-4">
          {form.terms.map((s, i) => {
            const upd = (patch: Partial<TermsSection>) => set("terms", form.terms.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const move = (d: -1 | 1) => {
              const next = [...form.terms];
              [next[i], next[i + d]] = [next[i + d], next[i]];
              set("terms", next);
            };
            return (
              <li key={i} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-sm font-semibold tabular-nums text-ink-faint">{i + 1}</span>
                  <input aria-label="Judul bagian" placeholder="Judul bagian" value={s.title} onChange={(e) => upd({ title: e.target.value })} className={`${inlineInputCls} font-semibold`} />
                  <button type="button" aria-label="Naikkan" disabled={i === 0} onClick={() => move(-1)} className="rounded-sm px-2 py-1 text-ink-muted hover:bg-surface-sunken disabled:opacity-30">↑</button>
                  <button type="button" aria-label="Turunkan" disabled={i === form.terms.length - 1} onClick={() => move(1)} className="rounded-sm px-2 py-1 text-ink-muted hover:bg-surface-sunken disabled:opacity-30">↓</button>
                  <RemoveButton onClick={() => set("terms", form.terms.filter((_, j) => j !== i))} />
                </div>
                <textarea aria-label="Isi bagian" rows={4} value={s.body} onChange={(e) => upd({ body: e.target.value })} className={inputCls} />
              </li>
            );
          })}
        </ol>
        <AddButton onClick={() => set("terms", [...form.terms, { title: "", body: "" }])}>Tambah bagian</AddButton>
      </Section>
    </div>
  );
}

function Section({
  title,
  form,
  keys,
  prepare = (f) => f,
  validate,
  children,
}: {
  title: string;
  form: Form;
  keys: (keyof Form)[];
  prepare?: (f: Form) => Form;
  validate: (f: Form) => string | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });

  async function save() {
    const f = prepare(form);
    const err = validate(f);
    if (err) return setState({ busy: false, msg: err, ok: false });
    setState({ busy: true, msg: null, ok: false });
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("settings")
      .upsert(keys.map((k) => ({ key: k, value: f[k] as unknown as Json, updated_at: now })));
    setState({ busy: false, msg: error ? `Gagal menyimpan: ${error.message}` : "Tersimpan", ok: !error });
  }

  return (
    <section className="mt-6 rounded-lg border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
      <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={save}
          disabled={state.busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {state.busy ? "Menyimpan…" : "Simpan"}
        </button>
        {state.msg && (
          <p role="status" className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>
            {state.msg}
          </p>
        )}
      </div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-ink">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-ink-faint">{hint}</span>}
    </label>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mt-1 self-start text-sm font-semibold text-primary hover:underline">
      + {children}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" aria-label="Hapus" onClick={onClick} className="rounded-sm px-2 py-2 text-ink-faint hover:bg-danger-soft hover:text-danger">
      ✕
    </button>
  );
}
