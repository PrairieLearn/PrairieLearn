-- BLOCK select_file_metadata_for_course
SELECT
  sync_errors,
  sync_warnings,
  NULL AS uuid
FROM
  pl_courses
WHERE
  id = $course_id;

-- BLOCK select_file_metadata_for_question
SELECT
  sync_errors,
  sync_warnings,
  uuid
FROM
  questions
WHERE
  course_id = $course_id
  AND qid = $qid
  AND deleted_at IS NULL;

-- BLOCK select_file_metadata_for_course_instance
SELECT
  sync_errors,
  sync_warnings,
  uuid
FROM
  course_instances
WHERE
  course_id = $course_id
  AND short_name = $ciid
  AND deleted_at IS NULL;

-- BLOCK select_file_metadata_for_assessment
SELECT
  a.sync_errors,
  a.sync_warnings,
  a.uuid
FROM
  assessments AS a,
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.short_name = $ciid
  AND ci.deleted_at IS NULL
  AND a.course_instance_id = ci.id
  AND a.tid = $aid
  AND a.deleted_at IS NULL;
