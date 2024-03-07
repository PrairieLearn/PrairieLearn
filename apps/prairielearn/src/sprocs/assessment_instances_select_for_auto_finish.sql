CREATE FUNCTION
    assessment_instances_select_for_auto_finish(
        age_mins integer -- time in minutes (after last activity) when we auto-close an exam
    ) RETURNS TABLE (
        assessment_instance_id bigint,
        close_assessment boolean
    )
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
            a.type = 'Exam'
            -- Only consider assessment instances that were modified "recently";
            -- we have an index on `modified_at`, so this lets us avoid doing a
            -- sequential scan on the entire `assessment_instances` table.
            --
            -- "Recently" is defined as twice the `age_mins` value. This should
            -- ensure that any given assessment instance receives ample attempts
            -- at being finished, even in the unlikely scenario that PrairieLearn
            -- crashes multiple times while trying to finish it.
            --
            -- Note that this relies on the frequency of the `autoFinishExams`
            -- cron job being sufficiently less than `age_mins`. This is true
            -- by default.
            AND ai.modified_at > (CURRENT_TIMESTAMP - make_interval(mins => age_mins * 2))
            AND (
                (ai.open AND ai.auto_close)
                OR
                (ai.open = false AND ai.grading_needed)
            )
    LOOP
        assessment_instance_id := assessment_instance.id;

        -- Only mark this assessment as needing to be closed if it's still open.
        close_assessment := assessment_instance.open;

        -- First check if the exam is closed and in need of grading. We can
        -- immediately append it to the results if that's the case.
        IF assessment_instance.open = false AND assessment_instance.grading_needed THEN
            RETURN NEXT;
            CONTINUE;
        END IF;

        -- Skip any assessment instances with recent activity.
        CONTINUE WHEN CURRENT_TIMESTAMP - assessment_instance.modified_at < make_interval(mins => age_mins);

        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
