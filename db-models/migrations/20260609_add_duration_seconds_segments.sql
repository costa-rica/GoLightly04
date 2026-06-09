ALTER TABLE meditations
  ADD COLUMN IF NOT EXISTS duration_seconds_talking INTEGER NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds_pause   INTEGER NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds_sound   INTEGER NULL;
