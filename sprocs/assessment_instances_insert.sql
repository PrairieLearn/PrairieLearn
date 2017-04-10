CREATE OR REPLACE FUNCTION
    assessment_instances_insert(
        IN assessment_id bigint,
        IN user_id bigint,
        IN authn_user_id bigint,
        IN mode enum_mode,
        IN time_limit_min integer DEFAULT NULL,
        IN date timestamptz DEFAULT NULL,
        OUT assessment_instance_id bigint
    )
AS $$
#variable_conflict use_column -- fix user_id reference in ON CONFLICT
DECLARE
    assessment assessments%rowtype;
    number integer := 1;
    date_limit timestamptz := NULL;
    auto_close boolean := FALSE;
    tmp_upgraded_iq_status boolean := TRUE; -- FIXME: delete this
BEGIN
    SELECT * INTO assessment FROM assessments where id = assessment_id;

    IF assessment.multiple_instance THEN
        SELECT coalesce(max(ai.number), 0) + 1
        INTO number
        FROM assessment_instances AS ai
        WHERE
            ai.assessment_id = assessment_instances_insert.assessment_id
            AND ai.user_id = assessment_instances_insert.user_id;
    END IF;

    -- if a.multiple_instance is FALSE then we force
    -- number = 1 so we will error on INSERT if there
    -- are existing assessment_instances

    IF time_limit_min IS NOT NULL THEN
        date_limit := date + make_interval(mins => time_limit_min);
    END IF;

    IF assessment.auto_close AND assessment.type = 'Exam' THEN
        auto_close := TRUE;
    END IF;

    INSERT INTO assessment_instances
            (auth_user_id, assessment_id, user_id, mode, auto_close, tmp_upgraded_iq_status, date_limit, number)
    VALUES (authn_user_id, assessment_id, user_id, mode, auto_close, tmp_upgraded_iq_status, date_limit, number)
    RETURNING id
    INTO assessment_instance_id;

    INSERT INTO last_accesses
            (user_id, last_access)
    VALUES  (user_id, current_timestamp)
    ON CONFLICT (user_id) DO UPDATE
    SET last_access = EXCLUDED.last_access;
END;
$$ LANGUAGE plpgsql VOLATILE;
