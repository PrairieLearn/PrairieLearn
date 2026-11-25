-- BLOCK select_instance_question
SELECT
  iq.id
FROM
  instance_questions iq
  JOIN assessment_questions aq ON aq.id = iq.assessment_question_id
  JOIN questions q ON q.id = aq.question_id
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND q.qid = 'addNumbers';

-- BLOCK select_latest_submission
SELECT
  *
FROM
  submissions
WHERE
  variant_id = $variant_id
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK extend_pt_reservation
UPDATE pt_reservations r
SET
  access_end = $access_end
FROM
  pt_enrollments pe
WHERE
  pe.id = r.enrollment_id
  AND pe.user_id = $user_id;

-- BLOCK set_assessment_instance_dates
UPDATE assessment_instances
SET
  date = $date,
  date_limit = $date_limit
WHERE
  id = $assessment_instance_id;

-- BLOCK enable_legacy_pt_rule
WITH
  updated_assessment AS (
    UPDATE assessments
    SET
      modern_access_control = FALSE
    WHERE
      id = $assessment_id
  )
INSERT INTO
  assessment_access_rules (
    assessment_id,
    number,
    mode,
    credit,
    active,
    exam_uuid
  )
VALUES
  (
    $assessment_id,
    10001,
    'Exam',
    100,
    TRUE,
    $exam_uuid
  );

-- BLOCK restore_modern_pt_rule
WITH
  deleted_rule AS (
    DELETE FROM assessment_access_rules
    WHERE
      assessment_id = $assessment_id
      AND number = 10001
  )
UPDATE assessments
SET
  modern_access_control = TRUE
WHERE
  id = $assessment_id;
