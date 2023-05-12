ALTER TABLE institutions
ADD COLUMN uid_regexp TEXT;

ALTER TABLE institutions
DROP COLUMN uid_pattern;
