-- BLOCK select_groups
SELECT
  *
FROM
  access_control_groups
WHERE
  course_instance_id = $course_instance_id;

-- BLOCK select_access_control
SELECT
  *
FROM
  access_control
WHERE
  assessment_id = $assessment_id
ORDER BY
  "order";

-- BLOCK insert_access_control
INSERT INTO
  access_control (
    course_instance_id,
    assessment_id,
    enabled,
    block_access,
    list_before_release,
    "order",
    date_control_enabled,
    date_control_release_date_enabled,
    date_control_release_date,
    date_control_due_date_enabled,
    date_control_due_date,
    date_control_early_deadlines_enabled,
    date_control_late_deadlines_enabled,
    date_control_after_last_deadline_allow_submissions,
    date_control_after_last_deadline_credit_enable,
    date_control_after_last_deadline_credit,
    date_control_duration_minutes_enabled,
    date_control_duration_minutes,
    date_control_password_enabled,
    date_control_password,
    prairietest_control_enable,
    after_complete_hide_questions_before_date_enabled,
    after_complete_hide_questions_before_date,
    after_complete_hide_questions_after_date_enabled,
    after_complete_hide_questions_after_date,
    after_complete_hide_score_before_date_enabled,
    after_complete_hide_score_before_date
  )
VALUES
  (
    $course_instance_id,
    $assessment_id,
    $enabled,
    $block_access,
    $list_before_release,
    $order,
    $date_control_enabled,
    $date_control_release_date_enabled,
    $date_control_release_date,
    $date_control_due_date_enabled,
    $date_control_due_date,
    $date_control_early_deadlines_enabled,
    $date_control_late_deadlines_enabled,
    $date_control_after_last_deadline_allow_submissions,
    $date_control_after_last_deadline_credit_enable,
    $date_control_after_last_deadline_credit,
    $date_control_duration_minutes_enabled,
    $date_control_duration_minutes,
    $date_control_password_enabled,
    $date_control_password,
    $prairietest_control_enable,
    $after_complete_hide_questions_before_date_enabled,
    $after_complete_hide_questions_before_date,
    $after_complete_hide_questions_after_date_enabled,
    $after_complete_hide_questions_after_date,
    $after_complete_hide_score_before_date_enabled,
    $after_complete_hide_score_before_date
  )
RETURNING
  *;

-- BLOCK delete_access_control
DELETE FROM access_control
WHERE
  assessment_id = $assessment_id;

-- BLOCK insert_access_control_targets
INSERT INTO
  access_control_target (access_control_id, target_type, target_id)
SELECT
  (t ->> 0)::bigint,
  (t ->> 1)::permission_scope,
  (t ->> 2)::bigint
FROM
  UNNEST($targets::jsonb[]) AS t
RETURNING
  *;

-- BLOCK delete_access_control_targets
DELETE FROM access_control_target
WHERE
  access_control_id = ANY ($access_control_ids::bigint[]);

-- BLOCK insert_access_control_early_deadlines
INSERT INTO
  access_control_early_deadline (access_control_id, date, credit)
SELECT
  (d ->> 0)::bigint,
  (d ->> 1)::timestamp with time zone,
  (d ->> 2)::integer
FROM
  UNNEST($deadlines::jsonb[]) AS d
RETURNING
  *;

-- BLOCK delete_access_control_early_deadlines
DELETE FROM access_control_early_deadline
WHERE
  access_control_id = ANY ($access_control_ids::bigint[]);

-- BLOCK insert_access_control_late_deadlines
INSERT INTO
  access_control_late_deadline (access_control_id, date, credit)
SELECT
  (d ->> 0)::bigint,
  (d ->> 1)::timestamp with time zone,
  (d ->> 2)::integer
FROM
  UNNEST($deadlines::jsonb[]) AS d
RETURNING
  *;

-- BLOCK delete_access_control_late_deadlines
DELETE FROM access_control_late_deadline
WHERE
  access_control_id = ANY ($access_control_ids::bigint[]);

-- BLOCK insert_access_control_prairietest_exams
INSERT INTO
  access_control_prairietest_exam (access_control_id, exam_id, read_only)
SELECT
  (e ->> 0)::bigint,
  (e ->> 1)::bigint,
  (e ->> 2)::boolean
FROM
  UNNEST($exams::jsonb[]) AS e
RETURNING
  *;

-- BLOCK delete_access_control_prairietest_exams
DELETE FROM access_control_prairietest_exam
WHERE
  access_control_id = ANY ($access_control_ids::bigint[]);

-- BLOCK get_exam_ids_by_uuids
SELECT
  uuid::text,
  exam_id
FROM
  exams
WHERE
  uuid = ANY ($exam_uuids::uuid[])
  AND course_id = $course_id;