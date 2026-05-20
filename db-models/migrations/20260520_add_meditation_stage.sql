DO $$
BEGIN
  CREATE TYPE meditation_stage AS ENUM ('template', 'staged', 'library');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE meditations
  ADD COLUMN IF NOT EXISTS stage meditation_stage NOT NULL DEFAULT 'library';

UPDATE meditations
SET stage = 'library'
WHERE stage IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS meditations_one_template
  ON meditations ((stage))
  WHERE stage = 'template';

CREATE UNIQUE INDEX IF NOT EXISTS meditations_one_staged_per_user
  ON meditations (user_id)
  WHERE stage = 'staged';
