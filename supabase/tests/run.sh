#!/bin/sh
# Local SQL test: needs a throwaway Postgres 14+ (NOT your Supabase project).  usage: tests/run.sh <psql args>   e.g. tests/run.sh -h /var/tmp/pgtest -p 5544 -d t
set -e; cd "$(dirname "$0")/.."
P="psql $* -v ON_ERROR_STOP=1 -q"
$P -c "drop schema if exists public cascade; create schema public; drop schema if exists private cascade; drop schema if exists auth cascade" 2>/dev/null
$P -f tests/stub.sql; $P -f 01_schema.sql 2>&1 | { grep -v 'skipping' || true; }; $P -f 02_avatar_options.sql; $P -f tests/test.sql 2>&1 | sed 's/^psql:[^ ]* //'
