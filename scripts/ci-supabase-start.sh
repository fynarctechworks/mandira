#!/usr/bin/env bash
#
# `supabase start` for CI, with retries and a readable failure.
#
# The CLI pulls a dozen images from ghcr.io. On 24 September 2026 the registry answered
# `toomanyrequests` three pushes running and the database job failed after 19 s, with nothing
# in the repository changed since it last passed. The workflow signs in to ghcr.io first,
# which raises the limit; this retries with a pause for what is left, and on a final failure
# puts the CLI's own last words in an annotation — readable without the raw log.
set -uo pipefail

for attempt in 1 2 3; do
  supabase start 2>&1 | tee /tmp/supabase-start.log
  status=${PIPESTATUS[0]}
  [ "$status" -eq 0 ] && exit 0

  echo "supabase start failed (attempt $attempt of 3); waiting before the next one."
  supabase stop --no-backup > /dev/null 2>&1 || true
  sleep $((attempt * 30))
done

echo "::error title=supabase start::$(tail -c 2500 /tmp/supabase-start.log | tr '\n' ' ')"
exit "$status"
