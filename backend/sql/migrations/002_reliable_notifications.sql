-- Additive: preserve all existing requests and content.
CREATE TABLE IF NOT EXISTS form_submissions (
  submission_key UUID PRIMARY KEY,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('reservations','events','contacts')),
  request_id INTEGER NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notification_jobs (
  id BIGSERIAL PRIMARY KEY,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('reservations','events','contacts')),
  request_id INTEGER NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('reception','confirmation')),
  state VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed','unconfigured','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  claim_token UUID,
  last_error VARCHAR(100),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_type,request_id,kind)
);
CREATE INDEX IF NOT EXISTS notification_jobs_due ON notification_jobs(state,next_attempt_at);
