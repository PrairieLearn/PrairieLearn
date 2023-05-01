CREATE FUNCTION
    authz_assessment_instance (
        IN assessment_instance_id bigint,
        IN authz_data JSONB,
        IN req_date timestamptz,
        IN display_timezone text,
        IN group_work boolean,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT authorized_edit boolean, -- Is this assessment available for editing by the given user?
        OUT exam_access_end timestamptz, -- If in exam mode, when does access end?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT time_limit_min integer,  -- Time limit (if any) for this assessment.
        OUT time_limit_expired boolean, -- Is the time limit expired?
        OUT password text,           -- Password (if any) for this assessment.
        OUT mode enum_mode,
        OUT seb_config JSONB,
        OUT show_closed_assessment boolean, -- If students can view the assessment after it is closed.
        OUT show_closed_assessment_score boolean, -- If students can view their grade after the assessment is closed
        OUT active boolean,         -- If the assessment is visible but not active
        OUT next_active_time text,  -- The next time the assessment becomes active. This is non-null only if the assessment is not currently active but will be later.
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    )
AS $$
DECLARE
    assessment_instance assessment_instances;
    assessment_result record;
BEGIN
    SELECT ai.*
    INTO assessment_instance
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    SELECT *
    INTO assessment_result
    FROM authz_assessment(assessment_instance.assessment_id, authz_data, req_date, display_timezone);

    -- take most data directly from the assessment_result
    exam_access_end := assessment_result.exam_access_end;
    credit := assessment_result.credit;
    credit_date_string := assessment_result.credit_date_string;
    time_limit_min := assessment_result.time_limit_min;
    password := assessment_result.password;
    access_rules := assessment_result.access_rules;
    mode := assessment_result.mode;
    seb_config := assessment_result.seb_config;
    show_closed_assessment := assessment_result.show_closed_assessment;
    show_closed_assessment_score := assessment_result.show_closed_assessment_score;
    active := assessment_result.active;
    next_active_time := assessment_result.next_active_time;

    time_limit_expired := FALSE;
    IF assessment_instance.date_limit IS NOT NULL AND assessment_instance.date_limit < req_date THEN
        time_limit_expired := TRUE;
    END IF;

    -- We start with the same access to the assessment instance as to the assessment.
    authorized := assessment_result.authorized;
    authorized_edit := assessment_result.authorized;

    -- The only difference between the assessment instance and the assessment is that
    -- the assessment instance has a user_id (i.e., the assessment instance is "owned"
    -- by a particular user).
    --
    -- If the assessment instance and the effective user have the same user_id, then
    -- no further action is necessary - access remains the same as for the assessment.
    -- (See sprocs/authz_assessment for why we need not check authn user permissions.)
    --
    -- If the assessment instance and the effective user do not have the same user_id,
    -- then we remove edit access entirely (an assessment instance can be edited only
    -- by its owner), and keep view access only if the effective user has permission
    -- to view student data (so far, we only checked this for the authn user).
    --
    -- To understand all of this, it may be helpful to consider an example of the
    -- four different cases. Suppose that X, Y, and Z are user_id's. Suppose that
    -- X and Y are distinct and that Y and Z are distinct. Suppose the authn user
    -- has user_id X. Then, the four cases can be described as follows:
    --
    -- 1) Effective user has user_id X, assessment instance has user_id X
    --
    --      Example: a student tries to access their own assessment instance
    --      through the student page route (no emulation).
    --
    -- 2) Effective user has user_id Y, assessment instance has user_id Y
    --
    --      Example: an instructor emulates a student and tries to access this
    --      student's assessment instance through the student page route.
    --
    -- 3) Effective user has user_id X, assessment instance has user_id Y
    --
    --      Example: an instructor tries to access a student's assessment instance
    --      through either the student or instructor page route (no emulation).
    --
    -- 4) Effective user has user_id Y, assessment instance has user_id Z
    --
    --      Example: an instructor emulates another instructor and tries to access
    --      a student's assessment instance through either the student or instructor
    --      page route.
    --
    -- Again, we only need to consider cases (3) and (4), both of which can be
    -- handled in exactly the same way with respect to access.
    --
    -- To emphasize, the only time authorized and authorized_edit will ever be
    -- different is when the effective user does not own the assessment instance.
    -- This is important. We rely on it, for example, when deciding what to tell
    -- the user about grading on an exam assessment instance. Be careful if you
    -- change this behavior!
    --
    -- What about groups? No problem. Everything is the same, except for group work
    -- we need to check instead that "there exists a group_users with the same group_id
    -- as the assessment instance and the same user_id as the effective user."
    IF
        (((group_work) AND (NOT EXISTS (SELECT * FROM group_users AS gu WHERE gu.group_id = assessment_instance.group_id AND gu.user_id = (authz_data->'user'->>'user_id')::bigint)))
        OR ((NOT group_work) AND ((authz_data->'user'->>'user_id')::bigint != assessment_instance.user_id)))
    THEN
        authorized := authorized AND (authz_data->>'has_course_instance_permission_view')::boolean;
        authorized_edit := FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
