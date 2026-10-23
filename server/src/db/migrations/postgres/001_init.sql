-- D7: diagnosis history on Postgres (same product schema as DATA-0 SQLite)
-- Search: GIN tsvector (SQLite uses FTS5 in ../001_init.sql)

CREATE TABLE IF NOT EXISTS diagnosis_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  log_hash TEXT NOT NULL,
  log_preview TEXT NOT NULL,
  fixture_id TEXT,
  provider TEXT NOT NULL,
  brain TEXT NOT NULL,
  likely_cause TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence TEXT NOT NULL,
  needs_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  rag_weak BOOLEAN NOT NULL DEFAULT FALSE,
  diagnosis_json TEXT NOT NULL,
  meta_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_user_created
  ON diagnosis_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_log_hash
  ON diagnosis_runs (log_hash);

CREATE INDEX IF NOT EXISTS idx_runs_cause
  ON diagnosis_runs (likely_cause);

CREATE INDEX IF NOT EXISTS idx_runs_search
  ON diagnosis_runs
  USING GIN (
    to_tsvector(
      'english',
      coalesce(likely_cause, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(log_preview, '')
    )
  );
