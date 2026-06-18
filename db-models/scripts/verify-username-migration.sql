-- Verification fixture for db-models/migrations/20260616_add_user_username.sql.
-- Usage from repo root against a disposable database/schema:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db-models/scripts/verify-username-migration.sql
-- This script creates and drops its own temporary users table.

BEGIN;

CREATE TEMP TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO users (id, email) VALUES
  (1, 'nick@example.com'),
  (2, 'nick@other.com'),
  (3, 'nick@third.com'),
  (4, 'nick2@example.com'),
  (5, '!!!@example.com'),
  (6, 'a@example.com'),
  (7, 'ab@example.com'),
  (8, '123@example.com'),
  (9, 'abcdefghijklmnopqrstuvwxyz1234@example.com'),
  (10, 'abcdefghijklmnopqrstuvwxyz1234@other.com');

INSERT INTO users (id, email)
SELECT 100 + n, 'bulk@example.com'
FROM generate_series(1, 125) AS n;

\i db-models/migrations/20260616_add_user_username.sql

DO $$
BEGIN
  IF (SELECT username FROM users WHERE id = 1) <> 'nick' THEN
    RAISE EXCEPTION 'expected id 1 username nick';
  END IF;
  IF (SELECT username FROM users WHERE id = 2) <> 'nick2' THEN
    RAISE EXCEPTION 'expected id 2 username nick2';
  END IF;
  IF (SELECT username FROM users WHERE id = 3) <> 'nick3' THEN
    RAISE EXCEPTION 'expected id 3 username nick3';
  END IF;
  IF (SELECT username FROM users WHERE id = 4) <> 'nick22' THEN
    RAISE EXCEPTION 'expected cross-base collision id 4 username nick22';
  END IF;
  IF (SELECT username FROM users WHERE id = 5) !~ '^[a-z0-9._-]{3,30}$' THEN
    RAISE EXCEPTION 'expected punctuation-only local to receive a valid seed';
  END IF;
  IF (SELECT username FROM users WHERE id = 6) <> 'auser' THEN
    RAISE EXCEPTION 'expected one-character local to pad deterministically to auser';
  END IF;
  IF (SELECT username FROM users WHERE id = 7) <> 'abuser' THEN
    RAISE EXCEPTION 'expected two-character local to pad deterministically to abuser';
  END IF;
  IF (SELECT username FROM users WHERE id = 8) <> '123' THEN
    RAISE EXCEPTION 'expected digit-leading local to remain valid';
  END IF;
  IF length((SELECT username FROM users WHERE id = 10)) > 30 THEN
    RAISE EXCEPTION 'expected truncated suffix username length <= 30';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE username IS NULL) THEN
    RAISE EXCEPTION 'null usernames remain';
  END IF;
  IF EXISTS (SELECT 1 FROM users GROUP BY lower(username) HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'duplicate lower(username) remains';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE username !~ '^[a-z0-9._-]{3,30}$') THEN
    RAISE EXCEPTION 'invalid username format remains';
  END IF;
END $$;

ROLLBACK;
