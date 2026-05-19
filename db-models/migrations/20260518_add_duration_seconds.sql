ALTER TABLE meditations
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NULL;
