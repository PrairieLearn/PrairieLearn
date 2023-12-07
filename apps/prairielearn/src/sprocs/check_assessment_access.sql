CREATE FUNCTION
    check_assessment_access (
        IN assessment_id bigint,
        IN authz_mode enum_mode,
        IN course_role enum_course_role,
        IN course_instance_role enum_course_instance_role,
        IN user_id bigint,
        IN uid text,
        IN date TIMESTAMP WITH TIME ZONE,
        IN display_timezone text,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT exam_access_end timestamp with time zone, -- If in exam mode, when does access end?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT end_date TIMESTAMP WITH TIME ZONE,
        OUT time_limit_min integer,  -- What is the time limit (if any) for this assessment.
        OUT password text,           -- What is the password (if any) for this assessment.
        OUT mode enum_mode,          -- Mode of the assessment.
        OUT seb_config JSONB,         -- SEBKeys (if any) for this assessment.
        OUT show_closed_assessment boolean, -- If students can view the assessment after it is closed.
        OUT show_closed_assessment_score boolean, -- If students can view their grade after the assessment is closed
        OUT active boolean,     -- If the assessment is visible but not active
        OUT next_active_time text, -- The next time the assessment becomes active. This is non-null only if the assessment is not currently active but will be later.
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    ) AS $$
DECLARE
    active_access_rule_id bigint;
    next_active_start_date TIMESTAMP WITH TIME ZONE;
    next_active_credit integer;
    credit_from_override integer;
    assessment_end_date TIMESTAMP WITH TIME ZONE;
    end_date_from_override TIMESTAMP WITH TIME ZONE;
    start_date_from_override TIMESTAMP WITH TIME ZONE;

BEGIN
    -- Check if the user has an entry in the assessment_access_policies table for this assessment_id.
    -- If yes, get the end_date from the assessment_access_policies table, otherwise, use the end_date from the assessment_access_rules table.
    SELECT aap.end_date , aap.credit , aap.start_date
    INTO end_date_from_override , credit_from_override , start_date_from_override
    FROM assessment_access_policies as aap
    WHERE aap.assessment_id = check_assessment_access.assessment_id
        AND (aap.user_id= check_assessment_access.user_id)
        -- AND start_date <= check_assessment_access.date
        -- AND end_date >= check_assessment_access.date
    ORDER BY end_date DESC
    LIMIT 1;

    IF end_date_from_override IS NOT NULL THEN
        authorized = TRUE;
        credit = credit_from_override;
        credit_date_string =  CASE
            WHEN (credit_from_override > 0) THEN
                credit_from_override::text || '%' || ' until ' || format_date_short(end_date_from_override, display_timezone)
                ELSE '' END;
        time_limit_min = (DATE_PART('epoch', end_date_from_override - now() - INTERVAL '31 seconds') / 60)::integer;
        password = NULL;
        mode = NULL;
        seb_config = NULL;
        show_closed_assessment = FALSE;
        show_closed_assessment_score = TRUE;
        active = TRUE;
        active_access_rule_id = 0;
    ELSE
        -- Choose the access rule which grants access ('authorized' is TRUE), if any, and has the highest 'credit'.
        SELECT
            caar.authorized,
            caar.exam_access_end,
            -- aar.end_date,
            CASE
                WHEN end_date_from_override IS NOT NULL THEN end_date_from_override
                ELSE aar.end_date
            END AS end_date,
            -- aar.credit,
            CASE
                WHEN credit_from_override IS NULL THEN aar.credit
                ELSE credit_from_override
            END AS credit,
            CASE
                WHEN (aar.credit > 0 OR credit_from_override > 0) AND aar.active THEN
                    (CASE
                        WHEN credit_from_override IS NULL THEN aar.credit::text || '%'
                        ELSE credit_from_override::text || '%'
                    END)
                    || COALESCE(' until ' || format_date_short(aar.end_date, display_timezone), '')
                ELSE 'None'
            END AS credit_date_string,

            -- If timer hits 0:00 at end_date, exam might end after end_date (overdue submission).
            -- Resolve race condition by subtracting 31 sec from end_date.
            -- Use 31 instead of 30 to force rounding (time_limit_min is in minutes).
            -- CASE WHEN aar.time_limit_min IS NULL THEN NULL
            --      WHEN aar.mode = 'Exam' THEN NULL
            --      ELSE LEAST(aar.time_limit_min, DATE_PART('epoch', aar.end_date - now() - INTERVAL '31 seconds') / 60)::integer
            -- END AS time_limit_min,
            CASE WHEN aar.time_limit_min IS NULL THEN NULL
                WHEN aar.mode = 'Exam' THEN NULL
                ELSE LEAST(aar.time_limit_min, DATE_PART('epoch', CASE
                    WHEN end_date_from_override IS NOT NULL THEN end_date_from_override
                    ELSE aar.end_date
                END - now() - INTERVAL '31 seconds') / 60)::integer
            END AS time_limit_min,
            aar.password,
            aar.mode,
            aar.seb_config,
            aar.show_closed_assessment,
            aar.show_closed_assessment_score,
            aar.active,
            aar.id
        INTO
            authorized,
            exam_access_end,
            assessment_end_date,
            credit,
            credit_date_string,
            time_limit_min,
            password,
            mode,
            seb_config,
            show_closed_assessment,
            show_closed_assessment_score,
            active,
            active_access_rule_id
        FROM
            assessment_access_rules AS aar
            JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.authz_mode,
                check_assessment_access.user_id, check_assessment_access.uid, check_assessment_access.date, TRUE) AS caar ON TRUE
        WHERE
            aar.assessment_id = check_assessment_access.assessment_id
            AND caar.authorized
            AND ((aar.role > 'Student') IS NOT TRUE)
        ORDER BY
            aar.credit DESC NULLS LAST,
            aar.number
        LIMIT 1;
    
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
            active = FALSE;
        END IF;
        
        -- Select the *next* access rule with active = true that gives the user access
        IF end_date_from_override IS NULL and active_access_rule_id IS NOT NULL AND check_assessment_access.date IS NOT NULL AND NOT active THEN
            SELECT
                aar.start_date,
                aar.credit
            INTO
                next_active_start_date,
                next_active_credit
            FROM
                assessment_access_rules AS aar
                JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.authz_mode,
                    check_assessment_access.user_id, check_assessment_access.uid, NULL, FALSE) AS caar ON TRUE
            WHERE
                aar.assessment_id = check_assessment_access.assessment_id
                AND aar.start_date IS NOT NULL
                AND aar.active
                AND aar.start_date > check_assessment_access.date
                AND caar.authorized
                AND ((aar.role > 'Student') IS NOT TRUE)
            ORDER BY
                aar.start_date,
                aar.credit DESC NULLS LAST,
                aar.number
            LIMIT 1;
        END IF;

        -- Update credit_date_string if the user cannot currently submit the assessment but can do so in the future.
        -- In addition, assigns next_active_time a text representation of the next time the assessment can be submitted.
        IF end_date_from_override IS NULL AND  NOT active AND next_active_start_date IS NOT NULL THEN
            IF next_active_credit IS NOT NULL AND next_active_credit > 0 THEN
                credit_date_string = next_active_credit::text || '% starting from ' || format_date_short(next_active_start_date, display_timezone);
            ELSE
                credit_date_string = 'None starting from ' || format_date_short(next_active_start_date, display_timezone);
            END IF;

            next_active_time = format_date_full_compact(next_active_start_date, display_timezone);
        END IF;
    END IF;
    
    -- Override if we are course staff
    IF (course_role >= 'Previewer' OR course_instance_role >= 'Student Data Viewer') THEN
        authorized = TRUE;
        credit = 100;
        credit_date_string = '100% (Staff override)';
        active_access_rule_id = NULL;
        time_limit_min = NULL;
        password = NULL;
        mode = NULL;
        seb_config = NULL;
        show_closed_assessment = TRUE;
        show_closed_assessment_score = TRUE;
        active = TRUE;
    END IF;

    -- List of all access rules that will grant access to this user/mode at some date (past or future),
    -- computed by ignoring the date argument.
    
    IF end_date_from_override IS NOT NULL AND credit_from_override IS NOT NULL THEN
        access_rules = jsonb_build_array(jsonb_build_object(
            'credit', credit_from_override::text || '%',
            'time_limit_min' , (DATE_PART('epoch', end_date_from_override - now() - INTERVAL '31 seconds') / 60)::integer,
            'start_date', format_date_full(start_date_from_override, display_timezone),
            'end_date', format_date_full(end_date_from_override, display_timezone),
            'mode' , NULL,
            'active', 0
        ));
    ELSE
        SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'credit', CASE 
                WHEN credit_from_override IS NOT NULL THEN credit_from_override::text || '%' 
                ELSE CASE WHEN aar.credit IS NOT NULL THEN aar.credit::text || '%' ELSE 'None' END
            END,
            'time_limit_min', CASE WHEN aar.time_limit_min IS NOT NULL THEN aar.time_limit_min::text || ' min' ELSE '—' END,
            'start_date', CASE WHEN aar.start_date IS NOT NULL THEN format_date_full(aar.start_date, display_timezone) ELSE '—' END,
            'end_date', CASE 
                WHEN end_date_from_override IS NOT NULL THEN format_date_full(end_date_from_override, display_timezone) 
                ELSE CASE WHEN aar.end_date IS NOT NULL THEN format_date_full(aar.end_date, display_timezone) ELSE '—' END
            END,
            'mode', aar.mode,
            'active', aar.id = active_access_rule_id
        ) ORDER BY aar.number), '[]'::jsonb)
        INTO
            access_rules
        FROM
            assessment_access_rules AS aar
            JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.authz_mode,
                check_assessment_access.user_id, check_assessment_access.uid, NULL, FALSE) AS caar ON TRUE
        WHERE
            aar.assessment_id = check_assessment_access.assessment_id
            AND ((aar.role > 'Student') IS NOT TRUE)
            AND (
                (aar.active AND caar.authorized)
                OR (course_role >= 'Previewer' OR course_instance_role >= 'Student Data Viewer') -- Override for instructors
            );
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
