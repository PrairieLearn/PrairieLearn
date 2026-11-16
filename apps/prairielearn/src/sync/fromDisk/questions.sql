-- BLOCK select_copied_from_questions
-- Resolve declared historical provenance independently of current sharing access.
-- Include soft-deleted courses/questions and questions that were never shared,
-- are no longer shared, or are not shared with the consuming course. Resolving
-- the relationship does not grant access to the source content.
SELECT
  reference.qid,
  source.id AS copied_from_question_id
FROM
  jsonb_to_recordset($source_references::jsonb) AS reference (qid text, course_uuid uuid, question_uuid uuid)
  LEFT JOIN courses AS course ON course.uuid = reference.course_uuid
  LEFT JOIN questions AS source ON source.course_id = course.id
  AND source.uuid = reference.question_uuid;

-- BLOCK update_copied_from
UPDATE questions AS question
SET
  copied_from = provenance.copied_from,
  copied_from_question_id = provenance.copied_from_question_id
FROM
  jsonb_to_recordset($provenance::jsonb) AS provenance (
    question_id bigint,
    copied_from text,
    copied_from_question_id bigint
  )
WHERE
  question.id = provenance.question_id
  AND question.course_id = $course_id
  AND (
    question.copied_from,
    question.copied_from_question_id
  ) IS DISTINCT FROM (
    provenance.copied_from,
    provenance.copied_from_question_id
  );

-- BLOCK resolve_copies_of_new_questions
UPDATE questions AS
copy
SET
  copied_from_question_id = source.id
FROM
  questions AS source
  JOIN courses AS source_course ON source_course.id = source.course_id
WHERE
  source.id = ANY ($new_question_ids::bigint[])
  AND copy.course_id = $course_id
  AND copy.deleted_at IS NULL
  AND NULLIF(copy.sync_errors, '') IS NULL
  AND copy.copied_from_question_id IS NULL
  AND lower(split_part(copy.copied_from, '/', 1)) = source_course.uuid::text
  AND lower(split_part(copy.copied_from, '/', 2)) = source.uuid::text;
