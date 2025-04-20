CREATE FUNCTION
    assessment_instances_insert(
        IN assessment_id bigint,
        IN user_id bigint,
        IN group_work boolean,
        IN authn_user_id bigint,
        IN mode enum_mode,
        IN time_limit_min integer DEFAULT NULL,
        IN date timestamptz DEFAULT NULL,
        IN client_fingerprint_id bigint DEFAULT NULL,
        OUT assessment_instance_id bigint
    )
AS $$
#variable_conflict use_column -- fix user_id reference in ON CONFLICT
DECLARE
    assessment assessments%rowtype;
    number integer := 1;
    date_limit timestamptz := NULL;
    auto_close boolean := FALSE;
    tmp_group_id bigint;
    include_in_statistics boolean;
BEGIN
    -- ######################################################################
    -- get the assessment

    SELECT * INTO assessment FROM assessments where id = assessment_id;

    -- ######################################################################
    -- determine the "group_id" of the new assessment instance
    IF group_work THEN
        SELECT
            gu.group_id
        INTO
            tmp_group_id
        FROM
            group_users as gu
            JOIN groups AS g ON (g.id = gu.group_id)
            JOIN group_configs AS gc ON (gc.id = g.group_config_id)
        WHERE
            gu.user_id = assessment_instances_insert.user_id
            AND gc.assessment_id = assessment_instances_insert.assessment_id
            AND gc.deleted_at IS NULL
            AND g.deleted_at IS NULL;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'no matched group_id with user_id: %', assessment_instances_insert.user_id;
        END IF;
    END IF;

    -- ######################################################################
    -- determine the "number" of the new assessment instance
    IF assessment.multiple_instance THEN
        SELECT coalesce(max(ai.number), 0) + 1
        INTO number
        FROM assessment_instances AS ai
        WHERE
            ai.assessment_id = assessment_instances_insert.assessment_id
            AND (CASE
                    WHEN group_work THEN ai.group_id = tmp_group_id
                    ELSE ai.user_id = assessment_instances_insert.user_id
                 END);
    END IF;

    -- if a.multiple_instance is FALSE then we use
    -- number = 1 so we will error on INSERT if there
    -- are existing assessment_instances

    -- ######################################################################
    -- determine other properties

    IF time_limit_min IS NOT NULL THEN
        date_limit := date + make_interval(mins => time_limit_min);
    END IF;

    IF assessment.auto_close AND assessment.type = 'Exam' THEN
        auto_close := TRUE;
    END IF;

    -- we will use this assessment instance for statistics if the user is NOT an instructor
    include_in_statistics := NOT users_is_instructor_in_course_instance(
        assessment_instances_insert.user_id,
        assessment.course_instance_id
    );

    -- ######################################################################
    -- do the actual insert
    -- ON CONFLICT: make sure there is no new instance created by student's teammate simultaneously
    -- ON CONFLICT will not update anything but for returning the id

    INSERT INTO assessment_instances
            ( auth_user_id, assessment_id, user_id,     group_id, mode, auto_close,
              date_limit, number, include_in_statistics, last_client_fingerprint_id)
    VALUES  (authn_user_id, assessment_id,
            CASE WHEN group_work THEN NULL      ELSE user_id END,
            CASE WHEN group_work THEN tmp_group_id ELSE NULL END, mode, auto_close,
              date_limit, number, include_in_statistics, client_fingerprint_id)
    ON CONFLICT (assessment_id, group_id, number) DO UPDATE
    SET assessment_id = excluded.assessment_id
    RETURNING id
    INTO assessment_instance_id;

    -- ######################################################################
    -- A null assessment_instance_id means we triggered ON CONFLICT
    -- one of teammates already created an instance, no need to create again
    IF assessment_instance_id IS NULL THEN
        RETURN;
    END IF;

    -- ######################################################################
    -- Add a log entry for the original time limit of the assessment instance
    INSERT INTO assessment_state_logs (open, assessment_instance_id, date_limit, auth_user_id, client_fingerprint_id)
    VALUES (true, assessment_instance_id, date_limit, authn_user_id, client_fingerprint_id);

    -- ######################################################################
    -- record the last access time
    IF group_work THEN
        INSERT INTO last_accesses
                (group_id, last_access)
        VALUES  (tmp_group_id, current_timestamp)
        ON CONFLICT (group_id) DO UPDATE
        SET last_access = EXCLUDED.last_access;
    ELSE
        INSERT INTO last_accesses
                (user_id, last_access)
        VALUES  (user_id, current_timestamp)
        ON CONFLICT (user_id) DO UPDATE
        SET last_access = EXCLUDED.last_access;
    END IF;

    -- ######################################################################
    -- create new questions if necessary
    PERFORM assessment_instances_update(assessment_instance_id, authn_user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
