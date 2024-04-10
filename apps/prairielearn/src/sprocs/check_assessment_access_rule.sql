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
    -- check access with PrairieTest

    << prairietest_access >>
    BEGIN
        -- is an exam_id hardcoded into the access rule? Check that first
        IF assessment_access_rule.exam_uuid IS NOT NULL THEN

            -- require exam mode
            IF check_assessment_access_rule.mode IS DISTINCT FROM 'Exam' THEN
                authorized := FALSE;
                EXIT prairietest_access;
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
                EXIT prairietest_access;
            END IF;

            -- we only get here if we don't have a reservation, so block access
            authorized := FALSE;

        END IF;
    END prairietest_access;
END;
$$ LANGUAGE plpgsql VOLATILE;
