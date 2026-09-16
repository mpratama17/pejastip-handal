import type { NextConfig } from "next";

// Static export ke Cloudflare Pages — tanpa server Node, tanpa Server Actions.
// Logic bisnis ada di RPC Postgres + Supabase Edge Functions (lihat docs/01 §Model akses).
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
