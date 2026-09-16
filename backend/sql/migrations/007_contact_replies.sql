CREATE TABLE IF NOT EXISTS contact_replies (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
  submission_key UUID NOT NULL UNIQUE,
  body TEXT NOT NULL,
  recipient VARCHAR(254) NOT NULL,
  subject VARCHAR(250) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contact_replies_contact ON contact_replies(contact_id,id);
ALTER TABLE notification_jobs DROP CONSTRAINT IF EXISTS notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check CHECK(kind IN ('reception','confirmation','reply'));
-- For kind=reply only, request_id identifies contact_replies.id.
