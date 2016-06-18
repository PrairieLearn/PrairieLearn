SELECT q.*,top.name as topic_name
FROM questions as q
JOIN topics as top ON (top.id = q.topic_id)
WHERE q.id = $1
AND q.deleted_at IS NULL;
