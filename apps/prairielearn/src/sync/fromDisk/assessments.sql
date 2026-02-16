-- BLOCK check_access_rules_exam_uuid
SELECT
  exam_uuids.value AS uuid,
  (
    EXISTS (
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
WITH
  iqi AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($imported_question_info::jsonb) AS (sharing_name text, qid text)
  )
SELECT
  q.qid,
  q.id,
  c.sharing_name
FROM
  questions AS q
  JOIN sharing_set_questions AS ssq ON q.id = ssq.question_id
  JOIN sharing_sets AS ss ON ssq.sharing_set_id = ss.id
  JOIN sharing_set_courses AS ssc ON ss.id = ssc.sharing_set_id
  JOIN courses AS c ON c.id = ss.course_id
  JOIN iqi ON (
    iqi.sharing_name = c.sharing_name
    AND iqi.qid = q.qid
  )
WHERE
  ssc.course_id = $course_id
  AND c.example_course IS FALSE
UNION
SELECT
  q.qid,
  q.id,
  c.sharing_name
FROM
  questions AS q
  JOIN courses AS c ON c.id = q.course_id
  JOIN iqi ON (
    iqi.sharing_name = c.sharing_name
    AND iqi.qid = q.qid
  )
WHERE
  q.share_publicly
  AND c.example_course IS FALSE;

-- BLOCK get_institution_id
SELECT
  institution_id
FROM
  courses
WHERE
  id = $course_id;

-- BLOCK sync_assessment_tools
WITH
  desired_tools AS (
    SELECT
      *
    FROM
      jsonb_to_recordset($tools::jsonb) AS (
        assessment_id bigint,
        tool text,
        enabled boolean,
        settings jsonb
      )
  ),
  upserted AS (
    INSERT INTO
      assessment_tools (assessment_id, tool, enabled, settings)
    SELECT
      assessment_id,
      tool,
      enabled,
      settings
    FROM
      desired_tools
    ON CONFLICT (assessment_id, tool) DO UPDATE
    SET
      enabled = EXCLUDED.enabled,
      settings = EXCLUDED.settings
    RETURNING
      assessment_tools.id,
      assessment_tools.assessment_id,
      assessment_tools.tool
  )
DELETE FROM assessment_tools
WHERE
  assessment_id = ANY ($assessment_ids::bigint[])
  AND (assessment_id, tool) NOT IN (
    SELECT
      assessment_id,
      tool
    FROM
      desired_tools
  );
