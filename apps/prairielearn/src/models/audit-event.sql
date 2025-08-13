-- BLOCK select_audit_events_by_subject_user_id_table_name_course_instance_id
SELECT
  *
FROM
  audit_events
WHERE
  subject_user_id = $subject_user_id
  AND table_name = $table_name
  AND course_instance_id = $course_instance_id
ORDER BY
  date DESC;

-- BLOCK select_audit_events_by_subject_user_id_course_instance_id
SELECT
  *
FROM
  audit_events
WHERE
  subject_user_id = $subject_user_id
  AND course_instance_id = $course_instance_id
ORDER BY
  date DESC;
