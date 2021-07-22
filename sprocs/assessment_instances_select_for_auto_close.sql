CREATE FUNCTION
    assessment_instances_select_for_auto_close(
        age_mins integer -- time in minutes (after last activity) when we auto-close an exam
    ) RETURNS TABLE (assessment_instance_id bigint)
AS $$
DECLARE
    assessment_instance assessment_instances;
    last_active_date timestamptz;
BEGIN
    -- start with all assessment_instances that are subject to auto-closing
    FOR assessment_instance IN
        SELECT
            ai.*
        FROM
            assessment_instances AS ai
            JOIN assessments AS a ON (a.id = ai.assessment_id)
        WHERE
            ai.open = true
            AND a.type = 'Exam'
            AND ai.auto_close
    LOOP
        assessment_instance_id := assessment_instance.id;

        -- find the oldest submission information
        SELECT s.date
        INTO last_active_date
        FROM
            instance_questions AS iq
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN submissions AS s ON (s.variant_id = v.id)
        WHERE
            iq.assessment_instance_id = assessment_instance.id
        ORDER BY
            s.id, s.date DESC
        LIMIT 1;

        -- if we didn't get anything from submissions then use exam start date
        last_active_date := coalesce(last_active_date, assessment_instance.date);

        -- only keep assessment_instances with no recent activity
        IF assessment_instance.date_limit IS NOT NULL THEN
            CONTINUE WHEN current_timestamp - assessment_instance.date_limit < '1 minute';
        ELSE
            CONTINUE WHEN current_timestamp - last_active_date < make_interval(mins => age_mins);
        END IF;

        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
