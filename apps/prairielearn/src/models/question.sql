-- BLOCK select_question_by_id
SELECT
  *
FROM
  questions
WHERE
  id = $question_id;

-- BLOCK select_questions_by_ids_and_course_id
SELECT
  *
FROM
  questions
WHERE
  id = ANY ($question_ids::bigint[])
  AND course_id = $course_id
ORDER BY
  qid,
  id;

-- BLOCK select_live_questions_by_ids_and_course_id
SELECT
  *
FROM
  questions
WHERE
  id = ANY ($question_ids::bigint[])
  AND course_id = $course_id
  AND deleted_at IS NULL
  AND draft IS FALSE
ORDER BY
  qid,
  id;

-- BLOCK select_question_by_qid
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id
  AND qid = $qid
  AND deleted_at IS NULL;

-- BLOCK update_question
UPDATE questions
SET
  deleted_at = CASE
    WHEN $update_deleted_at::boolean THEN $deleted_at::timestamptz
    ELSE deleted_at
  END,
  share_publicly = CASE
    WHEN $update_share_publicly::boolean THEN $share_publicly
    ELSE share_publicly
  END,
  share_source_publicly = CASE
    WHEN $update_share_source_publicly::boolean THEN $share_source_publicly
    ELSE share_source_publicly
  END
WHERE
  id = $question_id;

-- BLOCK select_question_by_uuid
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id
  AND uuid = $uuid
  AND deleted_at IS NULL;

-- BLOCK select_question_by_instance_question_id
SELECT
  q.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.id = $instance_question_id;

-- BLOCK select_questions_used_in_other_courses
SELECT DISTINCT
  q.id,
  q.qid
FROM
  questions AS q
  JOIN assessment_questions AS aq ON aq.question_id = q.id
  JOIN assessments AS a ON a.id = aq.assessment_id
  JOIN course_instances AS ci ON ci.id = a.course_instance_id
WHERE
  q.id = ANY ($question_ids::bigint[])
  AND q.course_id = $course_id
  AND ci.course_id != $course_id
  AND q.deleted_at IS NULL
  AND aq.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL;

-- BLOCK select_questions_for_course_instance_copy
SELECT DISTINCT
  q.*
FROM
  questions AS q
  JOIN assessment_questions AS aq ON (aq.question_id = q.id)
  JOIN assessments AS a ON (aq.assessment_id = a.id)
WHERE
  a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL
  AND aq.deleted_at IS NULL;
