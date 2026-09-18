#!/usr/bin/env bash
# Applies every migration to a scratch database and runs the policy tests.
# Needs a local PostgreSQL 14+ and nothing else. Never point this at production.
set -euo pipefail

HOST="${PGHOST:-/tmp}"
PORT="${PGPORT:-5433}"
USER="${PGUSER:-postgres}"
DB="${1:-swachhata_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"

psql_run() { psql -h "$HOST" -p "$PORT" -U "$USER" -v ON_ERROR_STOP=1 -q "$@"; }

echo "▸ recreating $DB"
dropdb -h "$HOST" -p "$PORT" -U "$USER" --if-exists "$DB"
createdb -h "$HOST" -p "$PORT" -U "$USER" "$DB"

echo "▸ stubbing Supabase auth (local only)"
psql_run -d "$DB" -f "$HERE/00_local_stubs.sql" >/dev/null

for file in "$HERE"/../migrations/*.sql; do
  echo "▸ $(basename "$file")"
  psql_run -d "$DB" -f "$file" >/dev/null
done

echo "▸ policy and invariant tests"
psql_run -d "$DB" -f "$HERE/01_policies_test.sql"
