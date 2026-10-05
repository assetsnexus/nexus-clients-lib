CREATE TABLE IF NOT EXISTS privacy_jobs (
  request_id text PRIMARY KEY,
  event_id text NOT NULL,
  kind text NOT NULL,
  type text NOT NULL,
  sub text NOT NULL,
  grant_id text NOT NULL DEFAULT '',
  details text,
  due_at timestamptz,
  payload jsonb NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  lease_until timestamptz,
  lease_owner text,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS privacy_jobs_due_idx ON privacy_jobs (status, next_attempt_at);
