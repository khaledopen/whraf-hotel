-- The previous global MySQL placeholder replacement also modified question
-- marks inside quoted URLs. Repair only this exact, known Google Maps pattern.
UPDATE hotel_settings SET value=REPLACE(value,'maps$1q=','maps?q='),updated_at=NOW()
WHERE setting_key='maps' AND value LIKE 'https://www.google.com/maps$1q=%';
