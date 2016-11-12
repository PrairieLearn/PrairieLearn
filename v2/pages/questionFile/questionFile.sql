-- BLOCK check_client_files
SELECT
    $filename IN (SELECT unnest(q.client_files)) AS access_allowed
FROM
    questions AS q
WHERE
    q.id = $question_id;
