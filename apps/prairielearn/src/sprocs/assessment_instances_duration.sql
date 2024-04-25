CREATE FUNCTION
    assessment_instances_duration(
        IN assessment_instance_id bigint,
        OUT duration interval
    )
AS $$
DECLARE
    assessment_instance assessment_instances%rowtype;
    assessment assessments%rowtype;
    inactivity_spacing interval;
BEGIN
    SELECT *
    INTO assessment_instance
    FROM assessment_instances
    WHERE id = assessment_instance_id;

    SELECT *
    INTO assessment
    FROM assessments
    WHERE id = assessment_instance.assessment_id;

    inactivity_spacing = '1 year';
    IF assessment.type = 'Homework' THEN
        inactivity_spacing = '1 hour';
    END IF;

    WITH
    all_dates AS (
        (
            SELECT assessment_instance.date
        )
        UNION ALL
        (
            SELECT
                s.date
            FROM
                submissions AS s
                JOIN variants AS v ON (v.id = s.variant_id)
                JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
            WHERE
                iq.assessment_instance_id = assessment_instance.id
        )
    ),
    all_gaps AS (
        SELECT date - lag(date) OVER (ORDER BY date) AS gap
        FROM all_dates
    )
    SELECT sum(gap)
    INTO duration
    FROM all_gaps
    WHERE gap < inactivity_spacing;

    duration := coalesce(duration, '0 seconds');
END;
$$ LANGUAGE plpgsql STABLE;
