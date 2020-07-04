-- BLOCK get_workspace_image
SELECT workspace_image
FROM questions as q
WHERE q.uuid = $quuid;

-- BLOCK get_workspace_port
SELECT workspace_port
FROM questions as q
WHERE q.uuid = $quuid;
