-- BLOCK select_assessment_access_policy
SELECT
  COALESCE(format_date_full_compact(aap.created_at, 'America/Chicago'), '—') AS created_at,
  COALESCE(aap.created_by::text, '—') AS created_by,
  COALESCE(aap.credit::text, '—') AS credit,
  COALESCE(format_date_full_compact(aap.end_date, 'America/Chicago'), '—') AS end_date,
  COALESCE(aap.group_id::text, '—') AS group_id,
  COALESCE(aap.note, '—') AS note,
  COALESCE(format_date_full_compact(aap.start_date, 'America/Chicago'), '—') AS start_date,
  -- COALESCE(aap.student_uid::text, '—') AS student_uid
  (SELECT uid FROM users WHERE user_id = aap.user_id) AS student_uid
FROM
  assessment_access_policies AS aap
WHERE assessment_id = $assessment_id
ORDER BY
  aap.created_at;

-- BLOCK check_group_in_course_instance
SELECT
  COUNT(*) AS count
FROM
  groups
WHERE
  course_instance_id = $course_instance_id AND id = $group_id;

-- BLOCK insert_assessment_access_policy
INSERT INTO assessment_access_policies
  (assessment_id, created_at, created_by, credit, end_date, group_id, note, start_date,user_id)
VALUES
  ($assessment_id, $created_at, $created_by, $credit, $end_date, $group_id, $note, $start_date, (SELECT user_id FROM users WHERE uid = $student_uid));


-- BLOCK update_assessment_access_policy
UPDATE assessment_access_policies
SET
  created_at = $created_at,
  created_by = $created_by,
  credit = $credit,
  end_date = $end_date,
  group_id = $group_id,
  note = $note,
  start_date = $start_date,
  user_id = (SELECT user_id FROM users WHERE uid = $student_uid)
WHERE
  assessment_id = $assessment_id
  AND (user_id = (SELECT user_id FROM users WHERE uid = $student_uid) OR group_id = $group_id);


-- BLOCK delete_assessment_access_policy
WITH deleted_rows AS (
  DELETE FROM assessment_access_policies
  WHERE (user_id = (SELECT user_id FROM users WHERE uid = $student_uid) OR group_id = $group_id)
    AND assessment_id = $assessment_id
  RETURNING *
)
SELECT
  COALESCE(format_date_full_compact(aap.created_at, 'America/Chicago'), '—') AS created_at,
  COALESCE(aap.created_by::text, '—') AS created_by,
  COALESCE(aap.credit::text, '—') AS credit,
  COALESCE(format_date_full_compact(aap.end_date, 'America/Chicago'), '—') AS end_date,
  COALESCE(aap.group_id::text, '—') AS group_id,
  COALESCE(aap.note, '—') AS note,
  COALESCE(format_date_full_compact(aap.start_date, 'America/Chicago'), '—') AS start_date,
  COALESCE(aap.student_uid::text, '—') AS student_uid
FROM
  assessment_access_policies AS aap
WHERE assessment_id = $assessment_id
ORDER BY aap.created_at;