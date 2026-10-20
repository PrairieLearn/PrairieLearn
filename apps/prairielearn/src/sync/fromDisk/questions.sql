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
  copied_from_question_id = provenance.copied_from_question_id,
  sync_warnings = provenance.sync_warnings
FROM
  jsonb_to_recordset($provenance::jsonb) AS provenance (
    question_id bigint,
    copied_from text,
    copied_from_question_id bigint,
    sync_warnings text
  )
WHERE
  question.id = provenance.question_id
  AND question.course_id = $course_id
  AND (
    question.copied_from,
    question.copied_from_question_id,
    question.sync_warnings
  ) IS DISTINCT FROM (
    provenance.copied_from,
    provenance.copied_from_question_id,
    provenance.sync_warnings
  );
