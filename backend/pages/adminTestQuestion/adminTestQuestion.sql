SELECT tq.*,q.qid,q.type,q.title,top.name as topic_name
FROM test_questions AS tq
JOIN questions AS q ON (q.id = tq.question_id)
JOIN topics AS top ON (top.id = q.topic_id)
WHERE tq.id = $1
AND tq.deleted_at IS NULL
AND q.deleted_at IS NULL;
