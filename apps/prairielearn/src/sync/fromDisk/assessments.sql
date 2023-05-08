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
