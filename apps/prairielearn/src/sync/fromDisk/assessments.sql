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
  qc.sharing_name
FROM
  questions AS q
  LEFT JOIN pl_courses AS qc on qc.id = q.course_id
  LEFT JOIN sharing_set_questions AS ssq ON q.id = ssq.question_id
  LEFT JOIN sharing_sets AS ss ON ssq.sharing_set_id = ss.id
  LEFT JOIN sharing_set_courses AS ssc ON ss.id = ssc.sharing_set_id
  LEFT JOIN jsonb_to_recordset($imported_question_info::JSONB) AS iqi (sharing_name text, qid text) ON (
    iqi.sharing_name = qc.sharing_name
    AND iqi.qid = q.qid
  )
WHERE
  ssc.course_id = $course_id
  OR q.shared_publicly;

-- BLOCK get_institution_id
SELECT
  institution_id
FROM
  pl_courses
WHERE
  id = $course_id;
