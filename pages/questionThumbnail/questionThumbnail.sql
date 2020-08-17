-- BLOCK questions
SELECT
    q.thumbnail_filename, q.qid, q.id
FROM
    questions as q
WHERE
    q.id = $question_id
