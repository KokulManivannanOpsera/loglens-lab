-- A3c: human feedback on diagnosis runs (thumbs up/down)

CREATE TABLE IF NOT EXISTS diagnosis_feedback (
  run_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES diagnosis_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_user
  ON diagnosis_feedback (user_id, updated_at DESC);
