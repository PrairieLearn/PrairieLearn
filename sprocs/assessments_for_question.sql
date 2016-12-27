DROP FUNCTION IF EXISTS assessments_for_question(integer,integer,integer);

-- Returns a JSON array describing the assessments containing question
-- question_id for course instance course_instance_id. If skip_assessment_id
-- is provided then that individual assessment is not included.

CREATE OR REPLACE FUNCTION
    assessments_for_question(
        question_id bigint,
        course_instance_id bigint,
        skip_assessment_id bigint DEFAULT NULL
    ) RETURNS JSONB
AS $$
SELECT
    JSONB_AGG(JSONB_BUILD_OBJECT(
        'label',aset.abbrev || a.number,
        'assessment_id',a.id,
        'color',aset.color
    ) ORDER BY (aset.number, a.number))
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    EXISTS (
        -- does this assessment contain the given question_id?
        SELECT *
        FROM assessment_questions AS aq
        WHERE
            aq.assessment_id = a.id
            AND aq.question_id = assessments_for_question.question_id
            AND aq.deleted_at IS NULL
    )
    AND a.deleted_at IS NULL
    AND a.course_instance_id = assessments_for_question.course_instance_id
    AND CASE WHEN skip_assessment_id IS NOT NULL THEN a.id != skip_assessment_id ELSE TRUE END;
$$ LANGUAGE SQL;
