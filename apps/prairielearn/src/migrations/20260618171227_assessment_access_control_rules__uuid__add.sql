ALTER TABLE assessment_access_control_rules
ADD COLUMN uuid uuid;

-- Backfilling is deferred until after all write paths that create non-default
-- access control rules have been deployed with UUID support.
CREATE UNIQUE INDEX assessment_access_control_rules_assessment_id_uuid_idx ON assessment_access_control_rules (assessment_id, uuid)
WHERE
  uuid IS NOT NULL;
