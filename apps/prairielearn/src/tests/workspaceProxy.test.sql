-- BLOCK select_workspace_question_id
SELECT
  id
FROM
  questions
WHERE
  qid = 'workspace'
  AND deleted_at IS NULL;

-- BLOCK mark_workspace_running
UPDATE workspaces
SET
  state = 'running',
  hostname = $hostname
WHERE
  id = $workspace_id;
