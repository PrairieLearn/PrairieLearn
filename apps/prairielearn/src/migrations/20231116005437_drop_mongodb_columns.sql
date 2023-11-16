ALTER TABLE assessment_instances
DROP COLUMN tiid;

ALTER TABLE assessment_instances
DROP COLUMN qids;

ALTER TABLE assessment_instances
DROP COLUMN obj;

ALTER TABLE variants
DROP COLUMN qiid;

ALTER TABLE submissions
DROP COLUMN sid;
