CREATE FUNCTION
    check_assessment_access_rule (
        IN assessment_access_rule assessment_access_rules,
        IN mode enum_mode,
        IN user_id bigint,
        IN uid text,
        IN date TIMESTAMP WITH TIME ZONE,
        IN use_date_check BOOLEAN, -- use a separate flag for safety, rather than having 'date = NULL' indicate this
        OUT authorized boolean,
        OUT exam_access_end TIMESTAMP WITH TIME ZONE
    ) AS $$
DECLARE
    ps_linked boolean;
BEGIN
    authorized := TRUE;

    IF assessment_access_rule.role > 'Student' THEN
        authorized := FALSE;
        RETURN;
    END IF;

    IF (assessment_access_rule.mode IS NOT NULL
        AND assessment_access_rule.mode != 'SEB') THEN
        IF mode IS NULL OR mode != assessment_access_rule.mode THEN
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

    -- ############################################################
    -- check access with PrairieSchedule using a linked course

    << schedule_access >>
    DECLARE
        ps_course_id bigint;
        reservation reservations;
    BEGIN
        -- is an exam_id hardcoded into the access rule? Check that first
        IF assessment_access_rule.exam_uuid IS NOT NULL THEN

            -- require exam mode
            IF check_assessment_access_rule.mode IS DISTINCT FROM 'Exam' THEN
                authorized := FALSE;
                EXIT schedule_access;
            END IF;

            -- is there a checked-in reservation?
            SELECT r.*
            INTO reservation
            FROM
                reservations AS r
                JOIN exams AS e USING(exam_id)
            WHERE
                e.uuid = assessment_access_rule.exam_uuid
                AND r.user_id = check_assessment_access_rule.user_id
                AND r.delete_date IS NULL
                AND date BETWEEN r.access_start AND r.access_end
            ORDER BY r.access_end DESC -- choose the longest-lasting if >1
            LIMIT 1;

            IF FOUND THEN
                -- we have a valid reservation, don't keep going to "authorized := FALSE"
                EXIT schedule_access;
            END IF;

            -- is there a checked-in pt_reservation?
            SELECT r.access_end
            INTO exam_access_end
            FROM
                pt_reservations AS r
                JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
                JOIN pt_exams AS x ON (x.id = r.exam_id)
            WHERE
                (date BETWEEN r.access_start AND r.access_end)
                AND e.user_id = check_assessment_access_rule.user_id
                AND x.uuid = assessment_access_rule.exam_uuid;

            IF FOUND THEN
                -- we have a valid reservation, don't keep going to "authorized := FALSE"
                EXIT schedule_access;
            END IF;

            -- we only get here if we don't have a reservation, so block access
            authorized := FALSE;

        ELSE -- no rule.exam_uuid defined, so search the long way

            -- only needed for exams
            EXIT schedule_access WHEN assessment_access_rule.mode IS DISTINCT FROM 'Exam';

            -- is there a corresponding PrairieSchedule course
            -- that we actually want to enforce? (course_instance.ps_linked=true)
            SELECT ps_c.course_id
            INTO ps_course_id
            FROM
                assessments AS a
                JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
                JOIN pl_courses AS pl_c ON (pl_c.id = ci.course_id)
                JOIN courses as ps_c ON (ps_c.pl_course_id = pl_c.id)
            WHERE
                ci.ps_linked IS TRUE AND
                a.id = assessment_access_rule.assessment_id;
            EXIT schedule_access WHEN NOT FOUND; -- no linked PS course, skip this check

            -- is there a current checked-in reservation?
            SELECT r.*
            INTO reservation
            FROM
                assessments AS a
                JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
                JOIN courses AS ps_c ON (ps_c.pl_course_id = ci.course_id)
                JOIN exams AS e ON (e.course_id = ps_c.course_id)
                JOIN reservations AS r USING (exam_id)
            WHERE
                a.id = assessment_access_rule.assessment_id
                AND r.user_id = check_assessment_access_rule.user_id
                AND r.delete_date IS NULL
                AND date BETWEEN r.access_start AND r.access_end
            ORDER BY r.access_end DESC -- choose the longest-lasting if more than one
            LIMIT 1;

            IF NOT FOUND THEN
                -- no reservation, so block access
                authorized := FALSE;
                EXIT schedule_access;
            END IF;
        END IF;
    END schedule_access;
END;
$$ LANGUAGE plpgsql VOLATILE;
