CREATE TABLE IF NOT EXISTS projection_snapshots (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES poll_runs(id) ON DELETE CASCADE,
  snapshot_date TIMESTAMPTZ NOT NULL,
  view_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (view_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS projection_snapshots_view_date_idx
  ON projection_snapshots(view_key, snapshot_date DESC);
