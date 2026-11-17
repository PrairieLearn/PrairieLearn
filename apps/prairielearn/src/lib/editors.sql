-- BLOCK select_course_instances_with_course
SELECT
  ci.long_name
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  -- Course instances with sync errors may have null long names
  AND ci.long_name IS NOT NULL;

-- BLOCK select_question_titles_for_course
SELECT
  q.title
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  -- Questions with sync errors may have null titles
  AND q.title IS NOT NULL;

-- BLOCK select_question_uuids_for_course
SELECT
  q.uuid
FROM
  questions AS q
WHERE
  -- We deliberately do not filter by deleted_at here. We want to fetch UUIDs
  -- even for deleted question so that we can avoid using the same UUID for a
  -- new question.
  q.course_id = $course_id
  -- Questions with sync errors may have null UUIDs
  AND q.uuid IS NOT NULL;

-- BLOCK update_draft_number
UPDATE courses
SET
  draft_number = draft_number + 1
WHERE
  id = $course_id
RETURNING
  draft_number;

-- BLOCK select_assessments_with_student_label
SELECT DISTINCT
  ci.short_name AS course_instance_directory,
  a.tid AS assessment_directory
FROM
  student_labels AS sl
  JOIN assessment_access_control_student_labels AS acsl ON (acsl.student_label_id = sl.id)
  JOIN assessment_access_control_rules AS aacr ON (aacr.id = acsl.assessment_access_control_rule_id)
  JOIN assessments AS a ON (a.id = aacr.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  sl.course_instance_id = $course_instance_id
  AND sl.name = $label_name
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL;
