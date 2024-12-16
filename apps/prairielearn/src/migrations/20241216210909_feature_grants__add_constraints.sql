ALTER TABLE feature_grants
ADD CONSTRAINT feature_grants_course_id_not_null CHECK (
  NOT (
    institution_id IS NOT NULL
    AND course_id IS NULL
  )
);

ALTER TABLE feature_grants
ADD CONSTRAINT feature_grants_course_instance_id_not_null CHECK (
  NOT (
    course_id IS NOT NULL
    AND course_instance_id IS NULL
  )
);
