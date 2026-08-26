#!/usr/bin/env bash
#
# Take a backup, then PROVE it restores (TRD-DEPL-003).
#
# A backup nobody has restored is not a backup, it is a file. Every step below exists
# because the failure it catches is silent until the worst possible moment:
#
#   - a dump that "succeeded" but was truncated by a broken pipe
#   - a restore that printed errors nobody read, losing a constraint or a policy
#   - an encrypted archive whose passphrase was never actually tried
#
# So this dumps, encrypts, DECRYPTS INTO A SCRATCH DATABASE, and compares what came back
# against what went in. Only then is the artifact kept.
#
# Usage:
#   BACKUP_PASSPHRASE=… scripts/backup-verify.sh            # local stack, via Docker
#   DATABASE_URL=postgres://… BACKUP_PASSPHRASE=… scripts/backup-verify.sh
#
# Everything goes through stdin/stdout rather than --file, so the same script works whether
# `pg_dump` is on PATH (CI) or only inside the Supabase container (a dev machine).

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${BACKUP_DIR}/mandhira-${STAMP}.sql.enc"
SCRATCH="restore_check_${STAMP//[^0-9]/}"

# Inside the container the database is on 5432 regardless of what it is published as.
LOCAL_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_Mandira}"
DEFAULT_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"

if command -v pg_dump >/dev/null 2>&1; then
  DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
  pg_dump_cmd() { pg_dump "$@"; }
  psql_cmd() { psql "$@"; }
else
  # No client tools on this machine; the Supabase image has both.
  if ! docker exec "${LOCAL_CONTAINER}" true >/dev/null 2>&1; then
    echo "Neither pg_dump on PATH nor the container '${LOCAL_CONTAINER}' is reachable." >&2
    exit 2
  fi
  echo "note: using the tools inside '${LOCAL_CONTAINER}'."
  DATABASE_URL="${DATABASE_URL:-${DEFAULT_URL}}"
  pg_dump_cmd() { docker exec -i "${LOCAL_CONTAINER}" pg_dump "$@"; }
  psql_cmd() { docker exec -i "${LOCAL_CONTAINER}" psql "$@"; }
fi

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE is not set. A plaintext dump of traveler data is not a backup," >&2
  echo "it is a breach waiting for whoever finds the artifact." >&2
  exit 1
fi

SCRATCH_URL="${DATABASE_URL%/*}/${SCRATCH}"
mkdir -p "${BACKUP_DIR}"

cleanup() {
  # The scratch database goes whether or not the check passed. Leaving a half-restored copy
  # of traveler data lying around is its own incident.
  psql_cmd "${DATABASE_URL}" -q -c "drop database if exists ${SCRATCH};" >/dev/null 2>&1 || true
  rm -f "${ARCHIVE}.plain" 2>/dev/null || true
}
trap cleanup EXIT

echo "1/5  Dumping…"
# --no-owner / --no-privileges: a scratch database has different roles, and failing on a
# missing role would fail the CHECK rather than the backup.
pg_dump_cmd "${DATABASE_URL}" --schema=public --schema=auth --no-owner --no-privileges > "${ARCHIVE}.plain"

if [ ! -s "${ARCHIVE}.plain" ]; then
  echo "The dump is empty. Refusing to keep it." >&2
  exit 1
fi

echo "2/5  Encrypting…"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "${ARCHIVE}.plain" -out "${ARCHIVE}" -pass env:BACKUP_PASSPHRASE

echo "3/5  Restoring the ENCRYPTED archive into a scratch database…"
psql_cmd "${DATABASE_URL}" -q -c "create database ${SCRATCH};"

# Mirror how the source database is actually arranged, rather than guessing.
#
# PostGIS, pg_trgm and pgvector live in an `extensions` schema here (Supabase's layout),
# reachable because the database's search_path names it. A scratch database without that
# arrangement fails on the first `geography` column with "type does not exist" — which
# looks exactly like a corrupt dump and is not.
#
# `public` is dropped first because `pg_dump --schema=public` emits its own CREATE SCHEMA,
# and restoring onto an existing one aborts under ON_ERROR_STOP.
psql_cmd "${SCRATCH_URL}" -q \
  -c "drop schema if exists public cascade;" \
  -c "create schema if not exists extensions;" \
  -c "create extension if not exists postgis with schema extensions;" \
  -c "create extension if not exists pg_trgm with schema extensions;" \
  -c "create extension if not exists vector with schema extensions;" >/dev/null

psql_cmd "${DATABASE_URL}" -q \
  -c "alter database ${SCRATCH} set search_path to \"\$user\", public, extensions;" >/dev/null

# Decrypted from the ARCHIVE, never from the plaintext dump — restoring the plaintext would
# prove the dump is good and say nothing about whether the encryption round-trips.
#
# ON_ERROR_STOP is the point of the whole exercise: a restore that prints errors and exits
# zero is how a corrupt backup passes for a good one for months.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "${ARCHIVE}" -pass env:BACKUP_PASSPHRASE \
  | psql_cmd "${SCRATCH_URL}" -v ON_ERROR_STOP=1 -q > /dev/null

echo "4/5  Comparing what came back…"

count_tables() {
  psql_cmd "$1" -t -A -c \
    "select count(*) from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE';" | tr -d '[:space:]'
}

count_policies() {
  psql_cmd "$1" -t -A -c \
    "select count(*) from pg_policies where schemaname='public';" | tr -d '[:space:]'
}

SOURCE_TABLES="$(count_tables "${DATABASE_URL}")"
RESTORED_TABLES="$(count_tables "${SCRATCH_URL}")"

if [ "${SOURCE_TABLES}" != "${RESTORED_TABLES}" ]; then
  echo "Table count differs: ${SOURCE_TABLES} in source, ${RESTORED_TABLES} restored." >&2
  exit 1
fi

# RLS policies are the thing most worth checking, and the thing a careless restore loses
# most quietly: the data comes back, the rules that decide who may read it do not, and
# nothing complains.
SOURCE_POLICIES="$(count_policies "${DATABASE_URL}")"
RESTORED_POLICIES="$(count_policies "${SCRATCH_URL}")"

if [ "${SOURCE_POLICIES}" != "${RESTORED_POLICIES}" ]; then
  echo "RLS policy count differs: ${SOURCE_POLICIES} in source, ${RESTORED_POLICIES} restored." >&2
  echo "A restore that loses policies returns the data without the rules protecting it." >&2
  exit 1
fi

echo "5/5  ${RESTORED_TABLES} tables and ${RESTORED_POLICIES} RLS policies restored."
echo
echo "Verified: ${ARCHIVE}"
echo "The restore was proven, not assumed."
