-- Repair photos left in draft by the previous room upload workflow.
-- Unlinked photos and demonstration content remain untouched.
UPDATE media m
SET status='published', validated=TRUE, updated_at=NOW()
WHERE m.is_demo=FALSE AND m.status='draft'
  AND m.url LIKE '/api/images/%'
  AND EXISTS (
    SELECT 1 FROM room_type_media link
    JOIN room_types room ON room.id=link.room_type_id
    WHERE link.media_id=m.id AND room.status='published'
      AND room.validated=TRUE AND room.is_demo=FALSE
  );
