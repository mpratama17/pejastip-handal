#!/usr/bin/env bash
# Cek: tebakan yang SALAH harus ikut terhitung rate limit (lihat migration
# 20261002000000). Jalan sebagai anon, langsung ke Supabase dari .env.local.
# 21 panggilan cepat: rate limit pakai window tetap 60 detik, jadi 21 panggilan
# paling banyak melintasi 2 window — minimal satu window pasti kena >10 dan
# minimal satu panggilan harus ditolak. Pemakaian: bash scripts/check-rate-limit.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.local; set +a
U="$NEXT_PUBLIC_SUPABASE_URL"; K="$NEXT_PUBLIC_SUPABASE_ANON_KEY"

call() { curl -s -X POST "$U/rest/v1/rpc/$1" -H "apikey: $K" -H "Authorization: Bearer $K" \
  -H "Content-Type: application/json" -d "$2"; }

fail=0
check() { # nama rpc, body
  local blocked=0
  for _ in $(seq 1 21); do
    call "$1" "$2" | grep -q "Terlalu banyak" && blocked=$((blocked + 1))
  done
  if [ "$blocked" -gt 0 ]; then echo "LULUS  $1: $blocked dari 21 tebakan salah ditolak"
  else echo "GAGAL  $1: 21 tebakan salah semuanya lolos"; fail=1; fi
}

check get_tracker '{"p_code":"ZZZZZZZZ"}'
check get_shippable_items '{"p_code":"ZZZZZZZZ","p_whatsapp":"081100000000"}'
exit $fail
