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
  poll_date_label TEXT,
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

CREATE TABLE IF NOT EXISTS aggregate_runs (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES poll_runs(id) ON DELETE CASCADE,
  aggregate_date TIMESTAMPTZ NOT NULL,
  labour NUMERIC,
  conservative NUMERIC,
  reform NUMERIC,
  libdem NUMERIC,
  green NUMERIC,
  snp NUMERIC,
  pc NUMERIC,
  others NUMERIC,
  lead_party TEXT,
  lead_value NUMERIC
);

CREATE INDEX IF NOT EXISTS aggregate_runs_date_idx ON aggregate_runs(aggregate_date);
