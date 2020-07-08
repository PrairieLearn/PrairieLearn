-- BLOCK get_workspace_image
SELECT q.workspace_image
FROM questions as q
WHERE q.uuid = $quuid;
