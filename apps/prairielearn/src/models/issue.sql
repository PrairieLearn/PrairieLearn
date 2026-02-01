-- BLOCK update_issue_open_status
UPDATE issues
SET
  open = $open
WHERE
  id = $issue_id
RETURNING
  id;
