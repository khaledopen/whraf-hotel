ALTER TABLE contact_messages DROP CONSTRAINT IF EXISTS contact_messages_status_check;
-- Old confirmation never sent a reply: keep these messages to be processed.
UPDATE contact_messages SET status=CASE
  WHEN status='confirmed' THEN 'processing'
  WHEN status IN ('declined','cancelled') THEN 'archived'
  ELSE status END
WHERE status IN ('confirmed','declined','cancelled');
ALTER TABLE contact_messages ADD CONSTRAINT contact_messages_status_check
  CHECK (status IN ('pending','processing','replied','archived'));
