DROP FUNCTION IF EXISTS check_assessment_access(bigint,enum_mode,enum_role,text,timestamp with time zone);
DROP FUNCTION IF EXISTS check_assessment_access(bigint,enum_mode,enum_role,text,timestamp with time zone,text);
DROP FUNCTION IF EXISTS check_assessment_access(bigint,enum_mode,enum_role,bigint,text,timestamp with time zone,text);

CREATE OR REPLACE FUNCTION
    check_assessment_access (
        IN assessment_id bigint,
        IN authz_mode enum_mode,
        IN role enum_role,
        IN user_id bigint,
        IN uid text,
        IN date TIMESTAMP WITH TIME ZONE,
        IN display_timezone text,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT time_limit_min integer,  -- What is the time limit (if any) for this assessment.
        OUT password text,           -- What is the password (if any) for this assessment.
        OUT mode enum_mode,          -- Mode of the assessment.
        OUT seb_config JSONB,         -- SEBKeys (if any) for this assessment.
        OUT show_closed_assessment boolean, -- If students can view the assessment after it is closed.
        OUT show_closed_assessment_score boolean, -- If students can view their grade after the assessment is closed
        OUT submittable boolean,     -- If the assessment is visible but not submittable
        OUT next_submittable_time text, -- The next time the assessment becomes submittable. This is non-null only if the assessment is not currently submittable but will be later.
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    ) AS $$
DECLARE
    active_access_rule_id bigint;
    next_submittable_start_date TIMESTAMP WITH TIME ZONE;
    next_submittable_credit integer;
BEGIN
    -- Choose the access rule which grants access ('authorized' is TRUE), if any, and has the highest 'credit'.
    SELECT
        caar.authorized,
        aar.credit,
        CASE
            WHEN aar.credit > 0 AND aar.submittable THEN
                aar.credit::text || '%'
                || (CASE
                        WHEN aar.end_date IS NOT NULL
                        THEN ' until ' || format_date_short(aar.end_date, display_timezone)
                        ELSE ''
                    END)
            ELSE 'None'
        END AS credit_date_string,
        -- If timer hits 0:00 at end_date, exam might end after end_date (overdue submission).
        -- Resolve race condition by subtracting 31 sec from end_date.
        -- Use 31 instead of 30 to force rounding (time_limit_min is in minutes).
        CASE WHEN aar.time_limit_min IS NULL THEN NULL
             WHEN aar.mode = 'Exam' THEN NULL
             ELSE LEAST(aar.time_limit_min, EXTRACT(EPOCH FROM aar.end_date - now() - INTERVAL '31 seconds') / 60)::integer
        END AS time_limit_min,
        aar.password,
        aar.mode,
        aar.seb_config,
        aar.show_closed_assessment,
        aar.show_closed_assessment_score,
        aar.submittable,
        aar.id
    INTO
        authorized,
        credit,
        credit_date_string,
        time_limit_min,
        password,
        mode,
        seb_config,
        show_closed_assessment,
        show_closed_assessment_score,
        submittable,
        active_access_rule_id
    FROM
        assessment_access_rules AS aar
        JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.authz_mode, check_assessment_access.role,
            check_assessment_access.user_id, check_assessment_access.uid, check_assessment_access.date, TRUE) AS caar ON TRUE
    WHERE
        aar.assessment_id = check_assessment_access.assessment_id
        AND caar.authorized
    ORDER BY
        aar.submittable DESC,
        aar.credit DESC NULLS LAST,
        aar.number
    LIMIT 1;
    
    -- Select the *next* access rule with submittable = true that gives the user access
    IF check_assessment_access.date IS NOT NULL THEN
        SELECT
            aar.start_date,
            aar.credit
        INTO
            next_submittable_start_date,
            next_submittable_credit
        FROM
            assessment_access_rules AS aar
            JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.authz_mode, check_assessment_access.role,
            check_assessment_access.user_id, check_assessment_access.uid, NULL, FALSE) AS caar ON TRUE
        WHERE
            aar.assessment_id = check_assessment_access.assessment_id
            AND aar.start_date IS NOT NULL
            AND aar.submittable
            AND aar.start_date > check_assessment_access.date
            AND caar.authorized
        ORDER BY
            aar.start_date,
            aar.credit DESC NULLS LAST,
            aar.number
        LIMIT 1;
    END IF;

    -- Fill in data if there were no access rules found
    IF active_access_rule_id IS NULL THEN
        authorized = FALSE;
        credit = 0;
        credit_date_string = 'None';
        time_limit_min = NULL;
        password = NULL;
        mode = NULL;
        seb_config = NULL;
        show_closed_assessment = TRUE;
        show_closed_assessment_score = TRUE;
        submittable = FALSE;
    END IF;

    -- Update credit_date_string if the user cannot currently submit the assessment but can do so in the future.
    -- In addition, assigns next_submittable_time a text representation of the next time the assessment can be submitted.
    IF NOT submittable AND next_submittable_start_date IS NOT NULL THEN
        IF next_submittable_credit IS NOT NULL AND next_submittable_credit > 0 THEN
            credit_date_string = next_submittable_credit::text || '% starting from ' || format_date_short(next_submittable_start_date, display_timezone);
        ELSE
            credit_date_string = 'None starting from ' || format_date_short(next_submittable_start_date, display_timezone);
        END IF;

        next_submittable_time = format_date_full_compact(next_submittable_start_date, display_timezone);
    END IF;

    -- Override if we are an Instructor
    IF role >= 'Instructor' THEN
        authorized = TRUE;
        credit = 100;
        credit_date_string = '100% (Instructor override)';
        active_access_rule_id = NULL;
        time_limit_min = NULL;
        password = NULL;
        mode = NULL;
        seb_config = NULL;
        show_closed_assessment = TRUE;
        show_closed_assessment_score = TRUE;
        submittable = TRUE;
    END IF;

    -- List of all access rules that will grant access to this user/mode/role at some date (past or future),
    -- computed by ignoring the date argument.
    SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'credit', CASE WHEN aar.credit IS NOT NULL THEN aar.credit::text || '%' ELSE 'None' END,
            'time_limit_min', CASE WHEN aar.time_limit_min IS NOT NULL THEN aar.time_limit_min::text || ' min' ELSE '—' END,
            'start_date', CASE WHEN start_date IS NOT NULL THEN format_date_full(start_date, display_timezone) ELSE '—' END,
            'end_date', CASE WHEN end_date IS NOT NULL THEN format_date_full(end_date, display_timezone) ELSE '—' END,
            'mode', aar.mode,
            'active', aar.id = active_access_rule_id
        ) ORDER BY aar.number), '[]'::jsonb)
    INTO
        access_rules
    FROM
        assessment_access_rules AS aar
        JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.authz_mode, check_assessment_access.role,
            check_assessment_access.user_id, check_assessment_access.uid, NULL, FALSE) AS caar ON TRUE
    WHERE
        aar.assessment_id = check_assessment_access.assessment_id
        AND caar.authorized;
END;
$$ LANGUAGE plpgsql VOLATILE;
