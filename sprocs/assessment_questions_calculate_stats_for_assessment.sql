CREATE OR REPLACE FUNCTION
    assessment_questions_calculate_stats_for_assessment (
        assessment_id_var bigint
    ) RETURNS VOID
AS $$
BEGIN
    PERFORM
        assessment_questions_calculate_stats(aq.id)
    FROM
        assessment_questions AS aq
    WHERE
        aq.assessment_id = assessment_id_var
        AND aq.deleted_at IS NULL;

    UPDATE
        assessments AS a
    SET
        stats_last_updated = current_timestamp
    WHERE a.id = assessment_id_var;

END;
$$ LANGUAGE plpgsql VOLATILE;