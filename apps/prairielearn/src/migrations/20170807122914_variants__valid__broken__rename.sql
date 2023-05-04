ALTER TABLE variants
ADD COLUMN broken boolean DEFAULT false;

UPDATE variants
SET
  broken = (NOT valid);

ALTER TABLE variants
DROP COLUMN valid;
