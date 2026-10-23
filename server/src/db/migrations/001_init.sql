-- DATA-0: diagnosis history (relational store)
-- Covers: tables, indexes, full-text search (FTS5)

CREATE TABLE IF NOT EXISTS diagnosis_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  log_hash TEXT NOT NULL,
  log_preview TEXT NOT NULL,
  fixture_id TEXT,
  provider TEXT NOT NULL,
  brain TEXT NOT NULL,
  likely_cause TEXT NOT NULL,
  summary TEXT NOT NULL,
  confidence TEXT NOT NULL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  rag_weak INTEGER NOT NULL DEFAULT 0,
  diagnosis_json TEXT NOT NULL,
  meta_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_user_created
  ON diagnosis_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_log_hash
  ON diagnosis_runs (log_hash);

CREATE INDEX IF NOT EXISTS idx_runs_cause
  ON diagnosis_runs (likely_cause);

-- Search role: FTS over cause / summary / preview (Elasticsearch later)
CREATE VIRTUAL TABLE IF NOT EXISTS diagnosis_fts USING fts5(
  run_id UNINDEXED,
  likely_cause,
  summary,
  log_preview
);
