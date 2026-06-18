ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

DO $$
DECLARE
  rec RECORD;
  raw_local TEXT;
  base TEXT;
  suffix_num INTEGER;
  suffix TEXT;
  candidate TEXT;
  assigned TEXT[] := ARRAY(
    SELECT lower(username)
    FROM users
    WHERE username IS NOT NULL
    ORDER BY id
  );
BEGIN
  FOR rec IN
    SELECT id, email
    FROM users
    WHERE username IS NULL
    ORDER BY id
  LOOP
    raw_local := lower(split_part(rec.email, '@', 1));
    base := regexp_replace(raw_local, '[^a-z0-9._-]', '', 'g');

    IF base = '' THEN
      base := 'user';
    END IF;

    WHILE length(base) < 3 LOOP
      base := base || 'user';
    END LOOP;

    base := left(base, 30);
    suffix_num := 1;

    LOOP
      IF suffix_num = 1 THEN
        suffix := '';
      ELSE
        suffix := suffix_num::TEXT;
      END IF;

      candidate := left(base, 30 - length(suffix)) || suffix;

      IF NOT lower(candidate) = ANY(assigned) THEN
        UPDATE users SET username = candidate WHERE id = rec.id;
        assigned := array_append(assigned, lower(candidate));
        EXIT;
      END IF;

      suffix_num := suffix_num + 1;
      IF suffix_num > 100000 THEN
        RAISE EXCEPTION 'Unable to allocate username for user id % after % attempts', rec.id, suffix_num;
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE username IS NULL) THEN
    RAISE EXCEPTION 'username migration failed: null usernames remain';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM users
    GROUP BY lower(username)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'username migration failed: duplicate lower(username) values remain';
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE username !~ '^[a-z0-9._-]{3,30}$') THEN
    RAISE EXCEPTION 'username migration failed: invalid username format remains';
  END IF;
END $$;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- Non-concurrent because existing repo raw SQL migrations are transaction-compatible files and
-- many migration runners wrap each file in a transaction. Run during the username rollout
-- maintenance/write-pause boundary described in the implementation report.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
