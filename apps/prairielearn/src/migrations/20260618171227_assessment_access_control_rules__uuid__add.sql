ALTER TABLE assessment_access_control_rules
ADD COLUMN uuid uuid;

UPDATE assessment_access_control_rules
SET
  uuid = gen_random_uuid()
WHERE
  target_type <> 'none'
  AND uuid IS NULL;

CREATE UNIQUE INDEX assessment_access_control_rules_assessment_id_uuid_idx ON assessment_access_control_rules (assessment_id, uuid)
WHERE
  uuid IS NOT NULL;
