-- check that the requested test question is in the requested test
SELECT tq.*
FROM test_questions AS tq
WHERE tq.id = $1
AND tq.test_id = $2
AND tq.deleted_at IS NULL;
