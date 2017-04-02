DROP FUNCTION IF EXISTS check_assessment_access_rule(assessment_access_rules,enum_mode,enum_role,text,timestamp with time zone,boolean);

CREATE OR REPLACE FUNCTION
    check_assessment_access_rule (
        IN assessment_access_rule assessment_access_rules,
        IN mode enum_mode,
        IN role enum_role,
        IN user_id bigint,
        IN uid text,
        IN date TIMESTAMP WITH TIME ZONE,
        IN use_date_check BOOLEAN, -- use a separate flag for safety, rather than having 'date = NULL' indicate this
        OUT authorized boolean
    ) AS $$
BEGIN
    authorized := TRUE;

    IF role >= 'Instructor' THEN
        RETURN;
    END IF;

    IF assessment_access_rule.mode IS NOT NULL THEN
        IF mode IS NULL OR mode != assessment_access_rule.mode THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF assessment_access_rule.role IS NOT NULL THEN
        IF role IS NULL OR role < assessment_access_rule.role THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF assessment_access_rule.uids IS NOT NULL THEN
        IF uid IS NULL OR uid != ALL (assessment_access_rule.uids) THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF use_date_check AND assessment_access_rule.start_date IS NOT NULL THEN
        IF date IS NULL OR date < assessment_access_rule.start_date THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF use_date_check AND assessment_access_rule.end_date IS NOT NULL THEN
        IF date IS NULL OR date > assessment_access_rule.end_date THEN
            authorized := FALSE;
        END IF;
    END IF;

    << schedule_access >> -- check access with PrairieSchedule
    DECLARE
        ps_course_id bigint;
        reservation reservations;
    BEGIN
        -- only needed for Exams when we care about the date
        EXIT schedule_access WHEN assessment_access_rule.mode != 'Exam';
        EXIT schedule_access WHEN NOT use_date_check;

        -- is there a corresponding PrairieSchedule course?
        SELECT ps_c.course_id
        INTO ps_course_id
        FROM
            assessments AS a
            JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
            JOIN pl_courses AS pl_c ON (pl_c.id = ci.course_id)
            JOIN courses as ps_c ON (ps_c.pl_course_id = pl_c.id)
        WHERE
            a.id = assessment_access_rule.assessment_id;
        EXIT schedule_access WHEN NOT FOUND; -- no linked PS course, skip this check

        -- get the reservation
        SELECT r.*
        INTO reservation
        FROM
            reservations AS r
            JOIN exams AS e USING (exam_id)
        WHERE
            e.course_id = ps_course_id
            AND r.user_id = check_assessment_access_rule.user_id
            AND r.delete_date IS NULL;

        IF NOT FOUND THEN
            -- no reservation, so block access
            authorized := FALSE;
            EXIT schedule_access;
        END IF;

        -- check the times
        -- we want this check to fail if we are outside the interval or if either
        -- access_{start,end} = NULL, so we need to be careful with the boolean comparison
        IF (reservation.access_start < date AND date < reservation.access_end) IS NOT TRUE THEN
            authorized := FALSE;
            EXIT schedule_access;
        END IF;
    END schedule_access;
END;
$$ LANGUAGE plpgsql VOLATILE;
