CREATE FUNCTION
    instance_questions_next_allowed_grade (
        IN instance_question_id bigint,
        OUT allow_grade_left_ms bigint
    )
AS $$
BEGIN
    SELECT
        GREATEST(0, floor(DATE_PART('epoch', (MAX(gj.date + aq.grade_rate_minutes * make_interval(mins => 1)) - CURRENT_TIMESTAMP)) * 1000))
    INTO
        allow_grade_left_ms
    FROM
        instance_questions iq
        JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
        JOIN variants v ON (v.instance_question_id = iq.id)
        JOIN submissions s ON (s.variant_id = v.id)
        JOIN grading_jobs gj ON (gj.submission_id = s.id)
    WHERE
        iq.id = instance_questions_next_allowed_grade.instance_question_id
        AND aq.grade_rate_minutes IS NOT NULL
        AND gj.gradable
        AND gj.grading_method NOT IN ('Manual', 'AI');

    IF NOT FOUND THEN
        allow_grade_left_ms := 0;
    END IF;

END;
$$ LANGUAGE PLPGSQL IMMUTABLE;
