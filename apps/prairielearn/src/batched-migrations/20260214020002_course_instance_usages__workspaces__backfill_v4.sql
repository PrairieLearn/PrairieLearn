-- BLOCK delete_old_usages
DELETE FROM course_instance_usages
WHERE
  type = 'Workspace'
  AND date < $END_DATE;

-- BLOCK select_bounds
SELECT
  max(id)
FROM
  workspaces
WHERE
  -- use `launched_at` for the index
  launched_at < $END_DATE
  -- also check `state_updated_at` so we don't double-count
  AND state_updated_at < $END_DATE;

-- BLOCK update_course_instance_usages_for_workspaces
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
  'Workspace',
  -- There will only be one institution, so we can use `any_value()`
  any_value (i.id),
  c.id,
  ci.id,
  date_trunc('day', w.state_updated_at, 'UTC'),
  -- Use v.authn_user_id because we don't care about really tracking the
  -- effective user, we are only using this to avoid contention when there are
  -- many users updating simultaneously.
  v.authn_user_id,
  -- It's possible that there are different values of `include_in_statistics`
  -- but we aren't worried about tracking this accurately.
  any_value (coalesce(ai.include_in_statistics, false)),
  sum(w.launching_duration + w.running_duration)
FROM
  workspaces AS w
  JOIN variants AS v ON (v.workspace_id = w.id)
  JOIN courses AS c ON (c.id = v.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  w.state_updated_at < $END_DATE
  AND w.id >= $start
  AND w.id <= $end
GROUP BY
  -- We need to aggregate by all columns in the unique constraint because INSERT
  -- ... ON CONFLICT DO UPDATE can't update a row multiple times.
  c.id,
  ci.id,
  date_trunc('day', w.state_updated_at, 'UTC'),
  v.authn_user_id
ON CONFLICT (
  -- Conflicts will only occur with pre-existing rows, not from rows inserted by
  -- the current execution of this query.
  type,
  course_id,
  course_instance_id,
  date,
  user_id
) DO UPDATE
SET
  duration = course_instance_usages.duration + EXCLUDED.duration;
