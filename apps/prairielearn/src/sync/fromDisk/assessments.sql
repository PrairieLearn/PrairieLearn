-- BLOCK check_access_rules_exam_uuid
SELECT
  exam_uuids.value AS uuid,
  (
    EXISTS (
      SELECT
        1
      FROM
        exams
      WHERE
        exams.uuid = exam_uuids.value::uuid
    )
    OR EXISTS (
      SELECT
        1
      FROM
        pt_exams
      WHERE
        pt_exams.uuid = exam_uuids.value::uuid
    )
  ) AS uuid_exists
FROM
  JSONB_ARRAY_ELEMENTS_TEXT($exam_uuids) AS exam_uuids;

-- BLOCK get_imported_questions
SELECT
  q.qid,
  q.id,
  c.sharing_name,
FROM
  questions AS q
  JOIN sharing_set_questions AS ssq ON q.id = ssq.question_id
  JOIN sharing_sets AS ss ON ssq.sharing_set_id = ss.id
  JOIN sharing_set_courses AS ssc ON ss.id = ssc.sharing_set_id
  JOIN pl_courses AS c ON c.id = ss.course_id
WHERE
  ssc.course_id = $course_id AND
  '@' || c.sharing_name || '/' || q.qid = ANY($imported_qids::text[]);

-- BLOCK get_course_info
SELECT
  question_sharing_enabled
FROM
  pl_courses
WHERE
  id = $course_id;
