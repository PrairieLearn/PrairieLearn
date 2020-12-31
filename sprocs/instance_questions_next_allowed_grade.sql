DROP FUNCTION IF EXISTS instance_questions_next_allowed_grade(bigint);
CREATE OR REPLACE FUNCTION
    instance_questions_next_allowed_grade (
        IN iq_id BIGINT,
        OUT allow_grade_date TIMESTAMPTZ,
        OUT allow_grade_formatted_date TEXT,
        OUT allow_grade_left_ms BIGINT
    )
AS $$
DECLARE
    question_id BIGINT;
    course_instance_id BIGINT;
    course_instance_display_timezone TEXT;
    course_display_timezone TEXT;
BEGIN
    SELECT
        aq.question_id,
        v.course_instance_id,
        MAX(gj.date + aq.grade_rate_minutes * INTERVAL '1 min')
    INTO
        question_id,
        course_instance_id,
        allow_grade_date
    FROM
        instance_questions iq
        JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
        JOIN variants v ON (v.instance_question_id = iq.id)
        JOIN submissions s ON (s.variant_id = v.id)
        JOIN grading_jobs gj ON (gj.submission_id = s.id)
    WHERE
        iq.id = iq_id
        AND aq.grade_rate_minutes IS NOT NULL
        AND gj.gradable
    GROUP BY
        aq.question_id,
        v.course_instance_id;

    IF NOT FOUND THEN
        allow_grade_date := NULL;
        allow_grade_formatted_date := NULL;
        allow_grade_left_ms := 0;
        RETURN;
    END IF;

    IF course_instance_id IS NOT NULL THEN
        SELECT ci.display_timezone
        INTO course_instance_display_timezone
        FROM course_instances AS ci
        WHERE ci.id = course_instance_id;
    END IF;

    SELECT c.display_timezone
    INTO course_display_timezone
    FROM 
        questions AS q
        JOIN pl_courses AS c ON (c.id = q.course_id)
    WHERE q.id = question_id;

    allow_grade_formatted_date := format_date_full_compact(allow_grade_date, COALESCE(course_instance_display_timezone, course_display_timezone));
    allow_grade_left_ms := GREATEST(0, floor(extract(epoch from (allow_grade_date - CURRENT_TIMESTAMP)) * 1000));

END;
$$ LANGUAGE PLPGSQL IMMUTABLE;
