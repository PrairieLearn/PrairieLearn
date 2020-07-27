-- BLOCK get_workspace_options
SELECT
    workspace_image,
    workspace_port,
    workspace_home,
    workspace_args,
    workspace_url_rewrite
FROM questions as q
WHERE q.uuid = $quuid;
