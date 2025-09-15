ALTER INDEX feature_grants_by_name_idx
RENAME TO feature_grants_by_name_idx_old;

ALTER INDEX feature_grants_by_entity_idx
RENAME TO feature_grants_by_entity_idx_old;

ALTER INDEX feature_grants_user_id_name_type_idx
RENAME TO feature_grants_user_id_name_type_idx_old;

ALTER INDEX feature_grants_name_user_id_type_idx
RENAME TO feature_grants_name_user_id_type_idx_old;

ALTER TABLE feature_grants
ADD CONSTRAINT feature_grants_by_name_idx UNIQUE (
  name,
  institution_id,
  course_id,
  course_instance_id,
  user_id
);

CREATE INDEX IF NOT EXISTS feature_grants_by_entity_idx ON feature_grants (
  institution_id,
  course_id,
  course_instance_id,
  user_id,
  name
);

CREATE INDEX IF NOT EXISTS feature_grants_user_id_name_idx ON feature_grants (user_id, name);

CREATE INDEX IF NOT EXISTS feature_grants_name_user_id_idx ON feature_grants (name, user_id);

ALTER TABLE feature_grants
DROP CONSTRAINT feature_grants_by_name_idx_old;

DROP INDEX feature_grants_by_entity_idx_old;

DROP INDEX feature_grants_user_id_name_type_idx_old;

DROP INDEX feature_grants_name_user_id_type_idx_old;
