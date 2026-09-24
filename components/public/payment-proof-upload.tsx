"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { formatIDR } from "@/lib/format";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function PaymentProofUpload({
  orderId,
  orderCode,
  customerCode,
  defaultAmount,
  onUploaded,
}: {
  orderId: string;
  orderCode: string;
  customerCode: string;
  defaultAmount: number;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState(String(defaultAmount));
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | undefined) {
    setError(null);
    setStatus("idle");
    if (!f) return setFile(null);
    if (!ALLOWED.includes(f.type)) {
      setFile(null);
      return setError("Format file harus JPG, PNG, WebP, atau PDF.");
    }
    if (f.type === "application/pdf" && f.size > MAX_BYTES) {
      setFile(null);
      return setError("PDF maksimal 5 MB.");
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    const nominal = Number(amount);
    if (!Number.isFinite(nominal) || nominal <= 0) return setError("Isi nominal yang kamu transfer.");

    setStatus("uploading");
    setError(null);
    const toSend = await compressImage(file);
    if (toSend.size > MAX_BYTES) {
      setStatus("idle");
      return setError("File masih lebih dari 5 MB setelah dikompres. Coba screenshot ulang.");
    }

    const path = `${orderId}/${Date.now()}.${EXT[toSend.type] ?? "bin"}`;
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(path, toSend, { contentType: toSend.type });
    if (uploadError) {
      setStatus("idle");
      // Ditolak policy storage: order batal, atau sudah 10 file bukti di order ini.
      const denied = "statusCode" in uploadError && String(uploadError.statusCode) === "403";
      return setError(
        denied
          ? "Upload ditolak: batas upload bukti untuk order ini sudah tercapai atau order sudah dibatalkan. Hubungi admin."
          : "Upload gagal. Periksa koneksi lalu coba lagi.",
      );
    }

    const { data: saved, error: rpcError } = await supabase.rpc("submit_payment_proof", {
      p_customer_code: customerCode,
      p_order_code: orderCode,
      p_amount_idr: nominal,
      p_method: "bank_transfer",
      p_paid_at: paidAt,
      p_proof_path: path,
    });
    if (rpcError) {
      setStatus("idle");
      return setError(rpcError.message);
    }
    if (!saved || saved.length === 0) {
      setStatus("idle");
      return setError("Order tidak ditemukan. Periksa kode lalu coba lagi.");
    }
    setStatus("done");
    setFile(null);
    onUploaded?.();
  }

  if (status === "done") {
    return (
      <p className="rounded-md bg-success-soft p-3 text-sm text-success" role="status">
        Bukti transfer {formatIDR(Number(amount))} terkirim. Admin akan memverifikasi, lalu status bayar berubah.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block text-sm font-medium">
        File bukti transfer
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={(e) => pickFile(e.target.files?.[0])}
          className="mt-1 block w-full cursor-pointer rounded-md border border-dashed border-ink bg-surface p-3 text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-ink file:border-solid file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-ink"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          Nominal (Rp)
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm tabular-nums"
          />
        </label>
        <label className="block text-sm font-medium">
          Tanggal transfer
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        onClick={upload}
        disabled={!file || status === "uploading"}
        className="btn btn-primary press px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
      >
        {status === "uploading" ? "Mengunggah…" : "Upload Bukti"}
      </button>
    </div>
  );
}
