ALTER TABLE submissions
ADD COLUMN broken boolean DEFAULT false;

ALTER TABLE submissions
ADD COLUMN gradable boolean DEFAULT true;
