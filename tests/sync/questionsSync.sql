-- BLOCK get_workspace_options
SELECT workspace_image, workspace_port, workspace_args
FROM questions as q
WHERE q.uuid = $quuid;
