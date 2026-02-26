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
