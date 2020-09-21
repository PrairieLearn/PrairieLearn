DROP FUNCTION IF EXISTS assessment_instances_insert(bigint,bigint,bigint,enum_mode,integer,timestamp with time zone);
DROP FUNCTION IF EXISTS assessment_instances_insert(bigint,bigint,boolean,bigint,enum_mode,integer,timestamp with time zone);

CREATE OR REPLACE FUNCTION
    assessment_instances_insert(
        IN assessment_id bigint,
        IN user_id bigint,
        IN group_work boolean,
        IN authn_user_id bigint,
        IN mode enum_mode,
        IN time_limit_min integer DEFAULT NULL,
        IN date timestamptz DEFAULT NULL,
        OUT assessment_instance_id bigint,
        OUT new_instance_question_ids bigint[]
    )
AS $$
#variable_conflict use_column -- fix user_id reference in ON CONFLICT
DECLARE
    assessment assessments%rowtype;
    number integer := 1;
    date_limit timestamptz := NULL;
    auto_close boolean := FALSE;
    tmp_group_id bigint;
BEGIN
    -- ######################################################################
    -- get the assessment

    SELECT * INTO assessment FROM assessments where id = assessment_id;

    -- ######################################################################
    -- determine the "number" of the new assessment instance
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

    -- ######################################################################
    -- do the actual insert

    INSERT INTO assessment_instances
            ( auth_user_id, assessment_id, user_id,     group_id, mode, auto_close, date_limit, number)
    VALUES  (authn_user_id, assessment_id, 
            CASE WHEN group_work THEN NULL      ELSE user_id END,
            CASE WHEN group_work THEN tmp_group_id ELSE NULL END, mode, auto_close, date_limit, number)
    RETURNING id
    INTO assessment_instance_id;

    -- ######################################################################
    -- start a record of the last access time
    -- After code review I will delete those two lines of comment
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

    IF assessment.type = 'Homework' THEN
        new_instance_question_ids := array[]::bigint[];
    ELSIF assessment.type = 'Exam' THEN
        PERFORM assessment_instances_update(assessment_instance_id, authn_user_id);
    ELSE
        RAISE EXCEPTION 'invalid assessment.type: %', assessment.type;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
