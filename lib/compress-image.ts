// docs/05 §3 Lapisan 5: screenshot HP 3–8 MB → WebP ≤ ~200 KB sebelum upload.
const MAX_SIDE = 1500;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 300_000) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
  // Browser tanpa encoder WebP mengembalikan PNG yang bisa lebih besar — pakai file asli.
  if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
  return new File([blob], "bukti.webp", { type: "image/webp" });
}
