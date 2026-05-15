-- BLOCK select_non_public_questions_in_assessment
SELECT
  q.id,
  q.qid
FROM
  assessment_questions AS aq
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
  AND NOT q.share_publicly
  AND NOT q.share_source_publicly
ORDER BY
  q.qid;

-- BLOCK select_non_public_assessments_in_course_instance
SELECT
  a.id,
  a.tid
FROM
  assessments AS a
WHERE
  a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL
  AND NOT a.share_source_publicly
ORDER BY
  a.tid;
