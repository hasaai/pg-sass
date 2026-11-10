# 0003: SQLite for local development, PostgreSQL for production

Date: 2026-10-17 · Status: accepted

## Context
The development laptop has no PostgreSQL installed. We want the project to run
with only `uv` installed.

## Decision
- `DB_ENGINE=sqlite` (the default) uses `backend/db.sqlite3`.
- `DB_ENGINE=postgres` uses the `POSTGRES_*` variables.
- Production settings refuse to start unless `DB_ENGINE=postgres`.
- CI runs the full test suite on both SQLite and PostgreSQL 16, so code that
  only works on one of them is caught before merge.

## Rules while both are supported
- No raw SQL or PostgreSQL-only features (ArrayField, JSONB operators, full-text
  search, row-level security) until we drop SQLite for development.
- `select_for_update()` is a no-op on SQLite; locking behaviour is verified by
  the PostgreSQL CI job.

## Moving to PostgreSQL
Install PostgreSQL (or `docker compose up -d db`), set `DB_ENGINE=postgres`,
run `migrate`. Local SQLite data is test data only and is not migrated.
