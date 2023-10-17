WITH
  assessment_users_with_workspace_counts AS (
    SELECT
      a.id AS assessment_id,
      v.authn_user_id,
      count(*) AS workspace_count
    FROM
      workspaces AS w
      JOIN variants AS v ON (v.workspace_id = w.id)
      JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
      JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
      JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
      w.state IN ('launching', 'running')
    GROUP BY
      a.id,
      v.authn_user_id
  ),
  assessments_with_workspace_counts AS (
    SELECT
      assessment_id,
      count(*) AS user_count,
      sum(workspace_count) AS workspace_count
    FROM
      assessment_users_with_workspace_counts
    GROUP BY
      assessment_id
  )
SELECT
  i.short_name AS institution,
  c.short_name AS course,
  c.id AS course_id,
  ci.short_name AS course_instance,
  ci.id AS course_instance_id,
  aset.abbreviation || a.number || ': ' || a.title AS assessment,
  a.id AS assessment_id,
  awwc.user_count,
  awwc.workspace_count
FROM
  assessments_with_workspace_counts AS awwc
  JOIN assessments AS a ON (a.id = awwc.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
ORDER BY
  awwc.workspace_count DESC,
  i.short_name,
  c.short_name,
  ci.short_name,
  assessment,
  a.id
LIMIT
  100;
