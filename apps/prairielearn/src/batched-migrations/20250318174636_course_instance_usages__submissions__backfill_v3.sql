-- BLOCK delete_old_usages
DELETE FROM course_instance_usages
WHERE
  type = 'Submission'
  AND date >= $START_DATE
  AND date < $END_DATE;

-- BLOCK select_min_bound
SELECT
  id
FROM
  submissions
WHERE
  date >= $START_DATE::timestamptz - interval '1 day'
ORDER BY
  date ASC,
  id ASC
LIMIT
  1;

-- BLOCK select_max_bound
SELECT
  id
FROM
  submissions
WHERE
  date < $END_DATE::timestamptz + interval '1 day'
ORDER BY
  date DESC,
  id DESC
LIMIT
  1;

-- BLOCK update_course_instance_usages_for_submissions
INSERT INTO
  course_instance_usages (
    type,
    institution_id,
    course_id,
    course_instance_id,
    date,
    user_id,
    include_in_statistics
  )
SELECT
  'Submission',
  i.id,
  c.id,
  ci.id,
  date_trunc('day', s.date, 'UTC'),
  -- We use `v.authn_user_id` for backfill, because this is guaranteed to be
  -- non-null and should virtually always be the same as `ai.user_id` for
  -- students (we want to match the user_id for student submissions, to avoid
  -- counting course staff as students).
  v.authn_user_id,
  coalesce(ai.include_in_statistics, false)
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN pl_courses AS c ON (c.id = q.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  s.id >= $start
  AND s.id <= $end
  -- The ID range we are backfilling is deliberately a superset of the rows in
  -- the exact date range, because date and ID are not strictly correlated.
  -- Because of this we additionally filter on the date range.
  AND s.date >= $START_DATE
  AND s.date < $END_DATE
ON CONFLICT (
  type,
  course_id,
  course_instance_id,
  date,
  user_id
) DO NOTHING;
