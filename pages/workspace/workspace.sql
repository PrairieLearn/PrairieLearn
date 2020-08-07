-- BLOCK select_question
SELECT
    q.id AS question_id,
    q.title AS question_title
FROM
    questions AS q
    JOIN variants AS v ON (v.question_id = q.id)
    JOIN workspaces AS w ON (v.workspace_id = w.id)
WHERE
    w.id = $workspace_id;
