-- BLOCK select_hostname_from_workspace_id
SELECT
  hostname
FROM
  workspaces
WHERE
  id = $workspace_id
  AND state = 'running';

-- BLOCK select_workspace_url_rewrite
SELECT
  -- While the workspace receives the url_rewrite value from the question's
  -- workspace_url_rewrite column in newer workspaces, older workspaces don't
  -- have this value. Until the batch migration completes, we default to the
  -- question settings for these older workspaces. A future update can remove
  -- this COALESCE.
  COALESCE(w.url_rewrite, q.workspace_url_rewrite, TRUE)
FROM
  workspaces AS w
  JOIN variants AS v ON (v.workspace_id = w.id)
  JOIN questions AS q ON (q.id = v.question_id)
WHERE
  w.id = $workspace_id;
