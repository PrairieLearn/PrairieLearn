-- Returns a JSON array describing the assessments containing question
-- question_id for course instance course_instance_id. If skip_assessment_id
-- is provided then that individual assessment is not included.

CREATE FUNCTION
    assessments_format_for_question(
        question_id bigint,
        course_instance_id bigint,
        skip_assessment_id bigint DEFAULT NULL
    ) RETURNS JSONB
AS $$
SELECT
    JSONB_AGG(JSONB_BUILD_OBJECT(
        'label', aset.abbreviation || a.number,
        'assessment_id', a.id,
        'course_instance_id', a.course_instance_id,
        'color', aset.color
    ) ORDER BY (aset.number, aset.id, a.number, a.id))
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
            AND aq.question_id = assessments_format_for_question.question_id
            AND aq.deleted_at IS NULL
    )
    AND a.deleted_at IS NULL
    AND CASE WHEN assessments_format_for_question.course_instance_id IS NOT NULL THEN a.course_instance_id = assessments_format_for_question.course_instance_id ELSE TRUE END
    AND CASE WHEN skip_assessment_id IS NOT NULL THEN a.id != skip_assessment_id ELSE TRUE END;
$$ LANGUAGE SQL VOLATILE;
