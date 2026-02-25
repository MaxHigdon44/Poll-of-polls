CREATE TABLE IF NOT EXISTS poll_runs (
  id SERIAL PRIMARY KEY,
  run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_url TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  UNIQUE (run_date)
);

CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES poll_runs(id) ON DELETE CASCADE,
  poll_date DATE NOT NULL,
  pollster TEXT NOT NULL,
  sample_size INTEGER,
  area TEXT,
  labour NUMERIC,
  conservative NUMERIC,
  libdem NUMERIC,
  green NUMERIC,
  reform NUMERIC,
  snp NUMERIC,
  pc NUMERIC,
  others NUMERIC
);

CREATE INDEX IF NOT EXISTS polls_run_id_idx ON polls(run_id);
