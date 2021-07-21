ALTER TABLE variants ADD COLUMN broken_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE variants ADD COLUMN broken_by bigint;

UPDATE variants SET broken_at = date WHERE variants.broken = true;

ALTER TABLE variants DROP COLUMN broken;
