import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Frontend statis, tanpa server — satu-satunya cara akses Supabase.
// Anon key aman untuk browser: tulisan publik dibatasi RLS + RPC
// security definer (lihat docs/01-database-schema.md §Model akses).
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
