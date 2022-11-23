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
    -- check access with schedulers

    << schedule_access >>
    DECLARE
        exam_uuid uuid;
    BEGIN
        -- error case, exam_uuids only work for mode:Exam assessments
        IF assessment_access_rule.exam_uuid IS NOT NULL AND mode != 'Exam' THEN
            authorized := FALSE;
        END IF;

        -- only enforce for mode:Exam otherwise skip
        IF mode != 'Exam' THEN
            EXIT schedule_access;
        END IF;

        -- is there a checked-in pt_reservation?
        SELECT x.uuid
        INTO exam_uuid
        FROM
            pt_reservations AS r
            JOIN pt_enrollments AS e ON (e.id = r.enrollment_id)
            JOIN pt_exams AS x ON (x.id = r.exam_id)
        WHERE
            (date BETWEEN r.access_start AND r.access_end)
            AND e.user_id = check_assessment_access_rule.user_id;

        IF FOUND THEN
            IF assessment_access_rule.exam_uuid = exam_uuid THEN
                -- exam_uuid matches, so don't keep going to authorized := FALSE
                EXIT schedule_access;
            ELSE
                -- checked-in so deny any exams that is not linked
                authorized := FALSE;
            END IF;
        END IF;

        IF assessment_access_rule.exam_uuid IS NOT NULL THEN
            -- If we got here, we don't have a checked in reservation so this should fail
            authorized := FALSE;
        END IF;

    END schedule_access;
END;
$$ LANGUAGE plpgsql VOLATILE;
