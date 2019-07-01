CREATE OR REPLACE FUNCTION
    sync_assessments(
        IN assessments JSONB,
        IN course_id bigint,
        IN course_instance_id bigint,
        IN check_access_rules_exam_uuid boolean
    )
AS $$
DECLARE
    assessment JSONB;
    new_assessment_id bigint;
    access_rule JSONB;
BEGIN
    -- The outermost structure of the JSON blob is an array of assessments
    FOR assessment IN SELECT * FROM JSONB_ARRAY_ELEMENTS(sync_assessments.assessments) LOOP
        INSERT INTO assessments
            (uuid,
            tid,
            type,
            number,
            order_by,
            title,
            config,
            multiple_instance,
            shuffle_questions,
            max_points,
            auto_close,
            deleted_at,
            course_instance_id,
            text,
            assessment_set_id,
            constant_question_value,
            allow_issue_reporting)
        (
            SELECT
                assessment->>'uuid'::uuid,
                assessment->>'tid',
                assessment->>'type',
                assessment->>'number',
                assessment->>'order_by'::integer,
                assessment->>'title',
                assessment->'config',
                assessment->>'multiple_instance'::boolean,
                assessment->>'shuffle_questions'::boolean,
                assessment->>'max_points'::double precision,
                assessment->>'auto_close'::boolean,
                NULL,
                sync_assessments.course_instance_id,
                assessment->>'text',
                COALESCE((SELECT id FROM assessment_sets WHERE name = assesment->>'set_name' AND course_id = sync_assessments.course_id), NULL),
                assessment->>'constant_question_value',
                assessment->>'allow_issue_reporting'::boolean
        )
        ON CONFLICT (uuid) DO UPDATE
        SET
            tid = EXCLUDED.tid,
            type = EXCLUDED.type,
            number = EXCLUDED.number,
            order_by = EXCLUDED.order_by,
            title = EXCLUDED.title,
            config = EXCLUDED.config,
            multiple_instance = EXCLUDED.multiple_instance,
            shuffle_questions = EXCLUDED.shuffle_questions,
            auto_close = EXCLUDED.auto_close,
            max_points = EXCLUDED.max_points,
            deleted_at = EXCLUDED.deleted_at,
            text = EXCLUDED.text,
            assessment_set_id = EXCLUDED.assessment_set_id,
            constant_question_value = EXCLUDED.constant_question_value,
            allow_issue_reporting = EXCLUDED.allow_issue_reporting
        WHERE
            assessments.course_instance_id = sync_assessments.course_instance_id
        RETURNING id INTO new_assessment_id;

        -- Now process all access rules for this assessment
        FOR access_rule IN SELECT * FROM JSONB_ARRAY_ELEMENTS(assessment->'allowAccess') LOOP
            -- If exam_uuid is specified, ensure that a corresponding PS exam exists
            IF access_rule->'exam_uuid' != NULL AND check_access_rules_exam_uuid THEN
                SELECT 1 FROM exams WHERE uuid = access_rule->>'exam_uuid';
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Assessment % allowAccess: No such examUuid % found in database. Ensure you copied the correct UUID from the scheduler.', assessment->>'tid', access_rule->>'exam_uuid';
                END IF;
            END IF;

            INSERT INTO assessment_access_rules
                (assessment_id,
                number,
                mode,
                role,
                credit,
                uids,
                time_limit_min,
                password,
                seb_config,
                exam_uuid,
                start_date,
                end_date)
            (
                SELECT
                    new_assessment_id,
                    access_rule->>'number'::integer,
                    access_rule->>'mode'::enum_mode,
                    access_rule->>'role'::enum_role,
                    access_rule->>'credit'::integer,
                    $uids::TEXT[],
                    $time_limit_min,
                    $password,
                    $seb_config,
                    $exam_uuid,
                    input_date(access_rule->>'start_date', ci.display_timezone),
                    input_date(access_rule->>'end_date', ci.display_timezone)
                FROM
                    assessments AS a
                    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
                WHERE
                    a.id = $assessment_id
            )
            ON CONFLICT (number, assessment_id) DO UPDATE
            SET
                mode = EXCLUDED.mode,
                role = EXCLUDED.role,
                credit = EXCLUDED.credit,
                time_limit_min = EXCLUDED.time_limit_min,
                password = EXCLUDED.password,
                exam_uuid = EXCLUDED.exam_uuid,
                uids = EXCLUDED.uids,
                seb_config = EXCLUDED.seb_config,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
