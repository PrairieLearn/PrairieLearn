CREATE FUNCTION
    instance_questions_next_allowed_grade (
        IN instance_question_id BIGINT,
        OUT allow_grade_date TIMESTAMPTZ,
        OUT allow_grade_left_ms BIGINT,
        OUT allow_grade_interval TEXT
    )
AS $$
BEGIN
    SELECT
        MAX(gj.date + aq.grade_rate_minutes * make_interval(mins => 1))
    INTO
        allow_grade_date
    FROM
        instance_questions iq
        JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
        JOIN variants v ON (v.instance_question_id = iq.id)
        JOIN submissions s ON (s.variant_id = v.id)
        JOIN grading_jobs gj ON (gj.submission_id = s.id)
    WHERE
        iq.id = instance_questions_next_allowed_grade.instance_question_id
        AND aq.grade_rate_minutes IS NOT NULL
        AND gj.gradable;

    IF NOT FOUND THEN
        allow_grade_date := NULL;
        allow_grade_left_ms := 0;
        allow_grade_interval := 'now';
    ELSE
        allow_grade_left_ms := GREATEST(0, floor(DATE_PART('epoch', (allow_grade_date - CURRENT_TIMESTAMP)) * 1000));
        
        WITH parts AS (
            SELECT
                div(allow_grade_left_ms, 1000 * 60 * 60 * 24)     AS days,
                mod(div(allow_grade_left_ms, 1000 * 60 * 60), 24) AS hours,
                mod(div(allow_grade_left_ms, 1000 * 60), 60)      AS mins,
                mod(div(allow_grade_left_ms, 1000), 60)           AS secs
        )
        SELECT
            CASE
                WHEN days > 1 THEN 'in ' || days::text || ' days'
                WHEN days > 0 THEN 'in ' || days::text || ' day'
                WHEN hours > 1 THEN 'in ' || hours::text || ' hours'
                WHEN hours > 0 THEN 'in ' || hours::text || ' hour'
                WHEN mins > 1 THEN 'in ' || mins::text || ' minutes'
                WHEN mins > 0 THEN 'in ' || mins::text || ' minute'
                WHEN secs > 1 THEN 'in ' || secs::text || ' seconds'
                ELSE 'soon'
            END
        INTO allow_grade_interval
        FROM parts;
    END IF;

END;
$$ LANGUAGE PLPGSQL IMMUTABLE;
