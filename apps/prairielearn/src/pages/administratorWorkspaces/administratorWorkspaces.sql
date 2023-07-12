-- BLOCK select_workspaces
SELECT
  w.id,
  w.state,
  format_interval (
    CASE
      WHEN w.state = 'launching' THEN (NOW() - w.launched_at)
      ELSE (NOW() - w.running_at)
    END
  ) AS time_in_state,
  wh.id AS workspace_host_id,
  wh.instance_id AS workspace_host_instance_id,
  wh.hostname AS workspace_host_hostname,
  wh.state AS workspace_host_state,
  format_interval (
    CASE
      WHEN wh.state = 'launching' THEN (NOW() - wh.launched_at)
      WHEN wh.state = 'ready' THEN (NOW() - wh.ready_at)
      WHEN wh.state = 'unhealthy' THEN (NOW() - wh.unhealthy_at)
      WHEN wh.state = 'terminated' THEN (NOW() - wh.terminated_at)
      ELSE make_interval()
    END
  ) AS workspace_host_time_in_state,
  q.qid AS question_name,
  ci.short_name AS course_instance_name,
  c.short_name AS course_name,
  i.short_name AS institution_name
FROM
  workspaces AS w
  JOIN workspace_hosts AS wh ON (w.workspace_host_id = wh.id)
  JOIN variants AS v ON (w.id = v.workspace_id)
  JOIN questions AS q ON (v.question_id = q.id)
  LEFT JOIN course_instances AS ci ON (v.course_instance_id = ci.id)
  JOIN pl_courses AS c ON (v.course_id = c.id)
  JOIN institutions AS i ON (c.institution_id = i.id)
WHERE
  w.state IN ('launching', 'running');
