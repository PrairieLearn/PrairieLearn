-- BLOCK select_workspace_paths
SELECT
    c.path AS course_path,
    q.qid AS question_qid
FROM
    pl_courses AS c
    JOIN questions AS q ON (q.course_id = c.id)
    JOIN variants AS v ON (v.question_id = q.id)
WHERE 
    v.workspace_id = $workspace_id;

-- BLOCK select_workspace_state
SELECT
    w.state
FROM
    workspaces as w
WHERE
    w.id = $workspace_id;

-- BLOCK update_workspace_state
UPDATE
    workspaces as w
SET
    state = 'stopped'::enum_workspace_state
WHERE
    w.id = $workspace_id;
