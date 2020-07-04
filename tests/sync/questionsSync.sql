-- BLOCK get_workspace_options
SELECT workspace_image, workspace_port
FROM questions as q
WHERE q.uuid = $quuid;
