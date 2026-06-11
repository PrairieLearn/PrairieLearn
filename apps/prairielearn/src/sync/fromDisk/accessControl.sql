-- BLOCK select_student_labels
SELECT
  *
FROM
  student_labels
WHERE
  course_instance_id = $course_instance_id;

-- BLOCK check_exam_uuids_exist
SELECT
  exam_uuids.value AS uuid,
  EXISTS (
    SELECT
      1
    FROM
      pt_exams
    WHERE
      pt_exams.uuid = exam_uuids.value::uuid
  ) AS uuid_exists
FROM
  JSONB_ARRAY_ELEMENTS_TEXT($exam_uuids) AS exam_uuids;
