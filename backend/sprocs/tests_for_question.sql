
-- Returns a JSON array describing the tests containing question
-- in_question_id for course instance in_course_instance_id. If
-- skip_test_id is provided then that individual test is not included.

CREATE OR REPLACE FUNCTION
    tests_for_question (in_question_id integer, in_course_instance_id integer, skip_test_id integer DEFAULT NULL) RETURNS JSONB AS $$
SELECT
    JSONB_AGG(JSONB_BUILD_OBJECT(
        'label',ts.abbrev || t.number,
        'test_id',t.id,
        'color',ts.color
    ) ORDER BY (ts.number, t.number))
FROM
    tests AS t
    JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE
    EXISTS (
        -- does this test contain the given question_id?
        SELECT * FROM test_questions AS tq
        WHERE tq.test_id = t.id AND tq.question_id = in_question_id AND tq.deleted_at IS NULL
    )
    AND t.deleted_at IS NULL
    AND t.course_instance_id = in_course_instance_id
    AND CASE WHEN skip_test_id IS NOT NULL THEN t.id != skip_test_id ELSE TRUE END;
$$ LANGUAGE SQL;
