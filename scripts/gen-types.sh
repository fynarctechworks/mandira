#!/usr/bin/env bash
# Regenerates packages/db/types.ts from the LOCAL Supabase schema.
#
# Run this after every migration (TRD §8.2). Table types are never hand-written
# (TRD §1.4) — edit a migration and re-run this instead.
#
#   pnpm db:types            regenerate
#   pnpm db:types:check      fail if the checked-in file is stale (used by CI)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" = "--check" ]; then
  if ! diff -u packages/db/types.ts <(npx supabase gen types typescript --local 2>/dev/null); then
    echo ""
    echo "packages/db/types.ts is out of date with supabase/migrations."
    echo "Run 'pnpm db:types' and commit the result."
    exit 1
  fi
  echo "packages/db/types.ts is current."
else
  npx supabase gen types typescript --local > packages/db/types.ts 2>/dev/null
  echo "Wrote packages/db/types.ts"
fi
