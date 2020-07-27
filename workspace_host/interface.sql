-- BLOCK select_workspace_settings
SELECT
    workspace_image,
    workspace_port,
    workspace_args,
    workspace_home,
    workspace_url_rewrite
FROM
    questions AS q
    JOIN variants AS v ON (v.question_id = q.id)
WHERE
    v.workspace_id = $workspace_id;
