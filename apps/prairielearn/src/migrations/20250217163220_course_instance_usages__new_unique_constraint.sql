ALTER TABLE course_instance_usages
ADD CONSTRAINT course_instance_usages_date_type_iid_cid_ciid_uid_incstats__key UNIQUE NULLS NOT DISTINCT (
  date,
  type,
  institution_id,
  course_id,
  course_instance_id,
  user_id,
  include_in_statistics
);

ALTER TABLE course_instance_usages
DROP CONSTRAINT course_instance_usages_date_type_course_id_course_instance__key;
