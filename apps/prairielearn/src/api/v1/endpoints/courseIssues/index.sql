-- BLOCK select_issues
SELECT
  i.id,
  i.date,
  i.open,
  i.manually_reported,
  i.course_caused,
  i.student_message,
  i.instructor_message,
  i.course_id,
  i.course_instance_id,
  i.assessment_id,
  i.instance_question_id,
  i.question_id,
  i.user_id,
  i.variant_id,
  ci.short_name AS course_instance_short_name,
  a.tid AS assessment_tid,
  NULLIF(COALESCE(aset.abbreviation, '') || COALESCE(a.number, ''), '') AS assessment_label,
  q.qid AS question_qid,
  u.uid AS user_uid,
  u.name AS user_name,
  u.email AS user_email
FROM
  issues AS i
  LEFT JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
  LEFT JOIN assessments AS a ON (a.id = i.assessment_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN questions AS q ON (q.id = i.question_id)
  LEFT JOIN users AS u ON (u.id = i.user_id)
WHERE
  i.course_id = $course_id
  -- Match the instructor UI which only ever surfaces course-caused issues.
  -- Non-course-caused issues are platform internals that should not be
  -- exposed via this endpoint.
  AND i.course_caused
  AND (
    $filter_open::boolean IS NULL
    OR i.open = $filter_open
  )
  AND (
    $filter_manually_reported::boolean IS NULL
    OR i.manually_reported = $filter_manually_reported
  )
  AND (
    $filter_since::timestamptz IS NULL
    OR i.date >= $filter_since
  )
ORDER BY
  i.date DESC,
  i.id DESC;

-- BLOCK select_issue_by_id
SELECT
  i.id,
  i.date,
  i.open,
  i.manually_reported,
  i.course_caused,
  i.student_message,
  i.instructor_message,
  i.system_data,
  i.course_data,
  i.course_id,
  i.course_instance_id,
  i.assessment_id,
  i.instance_question_id,
  i.question_id,
  i.user_id,
  i.variant_id,
  ci.short_name AS course_instance_short_name,
  a.tid AS assessment_tid,
  NULLIF(COALESCE(aset.abbreviation, '') || COALESCE(a.number, ''), '') AS assessment_label,
  q.qid AS question_qid,
  u.uid AS user_uid,
  u.name AS user_name,
  u.email AS user_email
FROM
  issues AS i
  LEFT JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
  LEFT JOIN assessments AS a ON (a.id = i.assessment_id)
  LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  LEFT JOIN questions AS q ON (q.id = i.question_id)
  LEFT JOIN users AS u ON (u.id = i.user_id)
WHERE
  i.id = $issue_id
  AND i.course_id = $course_id
  AND i.course_caused;
