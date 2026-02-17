-- BLOCK close_issue
UPDATE issues
SET
  open = false
WHERE
  id = $issue_id;
