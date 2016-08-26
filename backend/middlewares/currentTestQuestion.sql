-- check that the requested test question is in the current test
SELECT
    tq.*
FROM
    test_questions AS tq
WHERE
    tq.id = $test_question_id
    AND tq.test_id = $test_id;
