CREATE FUNCTION
    check_assessment_access_rule (
        IN assessment_access_rule assessment_access_rules,
        IN mode enum_mode,
        IN user_id bigint,
        IN uid text,
        IN date timestamp with time zone,
        IN use_date_check boolean, -- use a separate flag for safety, rather than having 'date = NULL' indicate this
        OUT authorized boolean,
        OUT exam_access_end timestamp with time zone
    ) AS $$
BEGIN
    authorized := TRUE;

    IF (assessment_access_rule.mode IS NOT NULL) THEN
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
    -- check access with PrairieTest

    IF (assessment_access_rule.exam_uuid IS NULL AND mode = 'Exam') THEN
        -- TODO: Assessments without an exam_uuid should not be allowed when the
        -- user is in exam mode because of a PrairieTest reservation, however an
        -- "effective mode" via cookies is still in use in our test cases, so
        -- right now this is only blocked if the mode is explicitly set to
        -- Public.
        IF assessment_access_rule.mode IS DISTINCT FROM 'Exam' THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF (assessment_access_rule.exam_uuid IS NOT NULL AND mode IS DISTINCT FROM 'Exam') THEN
        -- Exam mode is required for this access rule.
        authorized := FALSE;
    END IF;

    IF (assessment_access_rule.exam_uuid IS NOT NULL AND assessment_access_rule.mode IS DISTINCT FROM 'Exam') THEN
        -- Only use exam_uuid if the access rule has an explicit mode=Exam.
        authorized := FALSE;
    END IF;

    IF (assessment_access_rule.exam_uuid IS NOT NULL AND mode = 'Exam') THEN
        -- Look for a checked-in PrairieTest reservation.
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

        IF NOT FOUND THEN
            -- No reservation found; block access.
            authorized := FALSE;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
