ALTER TABLE variants ADD COLUMN broken_at TIMESTAMP WITH TIME ZONE default CURRENT_TIMESTAMP;
ALTER TABLE variants ADD COLUMN broken_by bigint default NULL;

UPDATE variants SET broken_at = CURRENT_TIMESTAMP WHERE variants.broken = true;

ALTER TABLE variants DROP COLUMN broken;
