ALTER TABLE feature_grants
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT feature_grants_course_id_not_null CHECK (
  NOT (
    institution_id IS NULL
    AND course_id IS NOT NULL
  )
);

ALTER TABLE feature_grants
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT feature_grants_course_instance_id_not_null CHECK (
  NOT (
    course_id IS NULL
    AND course_instance_id IS NOT NULL
  )
);
