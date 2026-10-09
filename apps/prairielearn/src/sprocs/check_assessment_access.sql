CREATE FUNCTION
    check_assessment_access (
        IN assessment_id bigint,
        IN authz_mode enum_mode,
        IN course_role enum_course_role,
        IN course_instance_role enum_course_instance_role,
        IN user_id bigint,
        IN uid text,
        IN date timestamp with time zone,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT exam_access_end timestamp with time zone, -- If in exam mode, when does access end?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_end_date timestamp with time zone,
        OUT next_active_date timestamp with time zone,
        OUT next_active_credit integer,
        OUT time_limit_min integer,  -- What is the time limit (if any) for this assessment.
        OUT password text,           -- What is the password (if any) for this assessment.
        OUT mode enum_mode,          -- Mode of the assessment.
        OUT show_closed_assessment boolean, -- If students can view the assessment after it is closed.
        OUT show_closed_assessment_score boolean, -- If students can view their grade after the assessment is closed
        OUT active boolean,        -- If the assessment is active
        OUT access_rules jsonb,      -- Raw access rule data. The currently active rule is marked by 'active' = TRUE.
        OUT staff_override boolean
    ) AS $$
DECLARE
    active_access_rule_id bigint;
BEGIN
    -- Choose the access rule which grants access ('authorized' is TRUE), if any, and has the highest 'credit'.
    SELECT
        caar.authorized,
        caar.exam_access_end,
        aar.credit,
        aar.end_date,
        -- If timer hits 0:00 at end_date, exam might end after end_date (overdue submission).
        -- Resolve race condition by subtracting 31 sec from end_date.
        -- Use 31 instead of 30 to force rounding (time_limit_min is in minutes).
        CASE WHEN aar.time_limit_min IS NULL THEN NULL
             WHEN aar.mode = 'Exam' THEN NULL
             ELSE LEAST(aar.time_limit_min, DATE_PART('epoch', aar.end_date - now() - INTERVAL '31 seconds') / 60)::integer
        END AS time_limit_min,
        aar.password,
        aar.mode,
        aar.show_closed_assessment,
        aar.show_closed_assessment_score,
        aar.active,
        aar.id
    INTO
        authorized,
        exam_access_end,
        credit,
        credit_end_date,
        time_limit_min,
        password,
        mode,
        show_closed_assessment,
        show_closed_assessment_score,
        active,
        active_access_rule_id
    FROM
        assessment_access_rules AS aar
        JOIN LATERAL check_assessment_access_rule(
            aar,
            check_assessment_access.authz_mode,
            check_assessment_access.user_id,
            check_assessment_access.uid,
            check_assessment_access.date,
            TRUE
        ) AS caar ON TRUE
    WHERE
        aar.assessment_id = check_assessment_access.assessment_id
        AND caar.authorized
    ORDER BY
        aar.credit DESC NULLS LAST,
        aar.number
    LIMIT 1;

    -- Fill in data if there were no access rules found
    IF active_access_rule_id IS NULL THEN
        authorized = FALSE;
        credit = 0;
        credit_end_date = NULL;
        time_limit_min = NULL;
        password = NULL;
        mode = NULL;
        show_closed_assessment = TRUE;
        show_closed_assessment_score = TRUE;
        active = FALSE;
    END IF;
    
    -- Select the *next* access rule with active = true that gives the user access
    IF active_access_rule_id IS NOT NULL AND check_assessment_access.date IS NOT NULL AND NOT active THEN
        SELECT
            aar.start_date,
            aar.credit
        INTO
            next_active_date,
            next_active_credit
        FROM
            assessment_access_rules AS aar
            JOIN LATERAL check_assessment_access_rule(
                aar,
                check_assessment_access.authz_mode,
                check_assessment_access.user_id,
                check_assessment_access.uid,
                NULL,
                FALSE
            ) AS caar ON TRUE
        WHERE
            aar.assessment_id = check_assessment_access.assessment_id
            AND aar.start_date IS NOT NULL
            AND aar.active
            AND aar.start_date > check_assessment_access.date
            AND caar.authorized
        ORDER BY
            aar.start_date,
            aar.credit DESC NULLS LAST,
            aar.number
        LIMIT 1;
    END IF;

    -- Override if we are course staff
    staff_override = FALSE;
    IF (course_role >= 'Previewer' OR course_instance_role >= 'Student Data Viewer') THEN
        authorized = TRUE;
        credit = 100;
        credit_end_date = NULL;
        active_access_rule_id = NULL;
        time_limit_min = NULL;
        password = NULL;
        mode = NULL;
        show_closed_assessment = TRUE;
        show_closed_assessment_score = TRUE;
        active = TRUE;
        staff_override = TRUE;
    END IF;

    -- List of all access rules that will grant access to this user/mode at some date (past or future),
    -- computed by ignoring the date argument.
    SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'credit', aar.credit,
            'time_limit_min', aar.time_limit_min,
            'start_date', aar.start_date,
            'end_date', aar.end_date,
            'mode', aar.mode,
            'active', aar.id = active_access_rule_id
        ) ORDER BY aar.number), '[]'::jsonb)
    INTO
        access_rules
    FROM
        assessment_access_rules AS aar
        JOIN LATERAL check_assessment_access_rule(
            aar,
            check_assessment_access.authz_mode,
            check_assessment_access.user_id,
            check_assessment_access.uid,
            NULL,
            FALSE
        ) AS caar ON TRUE
    WHERE
        aar.assessment_id = check_assessment_access.assessment_id
        AND (
            (aar.active AND caar.authorized)
            OR (course_role >= 'Previewer' OR course_instance_role >= 'Student Data Viewer') -- Override for instructors
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
