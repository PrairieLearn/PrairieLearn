-- BLOCK update_course_instance_usages_for_submission
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
  $user_id,
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
  LEFT JOIN course_instances AS ci ON (ci.course_id = a.course_instance_id)
WHERE
  s.id = $submission_id
ON CONFLICT (
  type,
  course_id,
  course_instance_id,
  date,
  user_id
) DO NOTHING;

-- BLOCK update_course_instance_usages_for_external_grading
INSERT INTO
  course_instance_usages (
    type,
    institution_id,
    course_id,
    course_instance_id,
    date,
    user_id,
    include_in_statistics,
    duration
  )
SELECT
  'External grading',
  i.id,
  c.id,
  ci.id,
  date_trunc('day', gj.grading_finished_at, 'UTC'),
  -- Use v.authn_user_id because we don't care about really tracking the
  -- effective user, we are only using this to avoid contention when there are
  -- many users updating simultaneously.
  v.authn_user_id,
  coalesce(ai.include_in_statistics, false),
  gj.grading_finished_at - gj.grading_received_at
FROM
  grading_jobs AS gj
  JOIN submissions AS s ON (s.id = gj.submission_id)
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN pl_courses AS c ON (c.id = q.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN course_instances AS ci ON (ci.course_id = a.course_instance_id)
WHERE
  gj.id = $grading_job_id
  -- Avoid inserting anything if we'd compute a NULL duration.
  AND gj.grading_received_at IS NOT NULL
  AND gj.grading_finished_at IS NOT NULL
  -- Avoid inserting negative durations.
  AND gj.grading_finished_at > gj.grading_received_at
ON CONFLICT (
  type,
  course_id,
  course_instance_id,
  date,
  user_id
) DO UPDATE
SET
  duration = course_instance_usages.duration + EXCLUDED.duration;
