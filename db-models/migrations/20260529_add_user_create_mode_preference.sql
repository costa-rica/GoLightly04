ALTER TABLE users
  ADD COLUMN IF NOT EXISTS show_script_mode_for_creating_meditations BOOLEAN NOT NULL DEFAULT FALSE;
