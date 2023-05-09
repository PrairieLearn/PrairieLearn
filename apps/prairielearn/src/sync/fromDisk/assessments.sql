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

-- BLOCK get_all_imported_questions
select
  q.qid,
  q.id,
  c.sharing_name
from
  questions as q
  join sharing_set_questions as qss on q.id = qss.question_id
  join sharing_sets as ss on qss.sharing_set_id = ss.id
  join sharing_set_courses as css on ss.id = css.sharing_set_id
  join pl_courses as c on c.id = ss.course_id
where
  css.course_id = $courseId;

-- BLOCK get_course_info
SELECT
  question_sharing_enabled
FROM
  pl_courses
WHERE
  id = $courseId;
