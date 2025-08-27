-- BLOCK select_audit_events_by_subject_user_id_table_names_course_instance_id
SELECT
  *
FROM
  audit_events
WHERE
  subject_user_id = $subject_user_id
  AND table_name IN (
    SELECT
      unnest($table_names::text[])
  )
  AND course_instance_id = $course_instance_id
ORDER BY
  date DESC;
