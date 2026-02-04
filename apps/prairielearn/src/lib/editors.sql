-- BLOCK select_assessments_with_question
SELECT
  ci.short_name AS course_instance_directory,
  a.tid AS assessment_directory
FROM
  assessment_questions AS aq
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  aq.question_id = $question_id
  AND aq.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL;

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

-- BLOCK select_assessments_with_assessment_set
SELECT
  ci.short_name AS course_instance_directory,
  a.tid AS assessment_directory
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  aset.name = $assessment_set_name
  AND aset.course_id = $course_id
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL;
