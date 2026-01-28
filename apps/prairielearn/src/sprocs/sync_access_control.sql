CREATE FUNCTION
    sync_access_control(
        IN syncing_course_instance_id bigint,
        IN syncing_assessment_id bigint,
        IN rules_data jsonb[],
        IN student_labels_data jsonb[],
        IN early_deadlines_data jsonb[],
        IN late_deadlines_data jsonb[],
        IN prairietest_exams_data jsonb[]
    )
RETURNS void
AS $$
DECLARE
    JSON_RULE_START CONSTANT integer := 0;
    rule JSONB;
    rule_number integer;
    new_rule_id bigint;
    max_json_rule_number integer;
BEGIN
    -- Calculate the max JSON rule number that will exist after sync
    max_json_rule_number := JSON_RULE_START + COALESCE(array_length(rules_data, 1), 0) - 1;

    -- Step 1: Delete child rows for JSON rules (target_type = 'none' or 'student_label')
    -- This must happen before the upsert to avoid constraint violations on child tables
    DELETE FROM assessment_access_control_student_labels
    WHERE assessment_access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = syncing_assessment_id AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_early_deadline
    WHERE access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = syncing_assessment_id AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_late_deadline
    WHERE access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = syncing_assessment_id AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_prairietest_exam
    WHERE access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = syncing_assessment_id AND target_type IN ('none', 'student_label')
    );

    -- Step 2: Loop through JSON rules and upsert each
    rule_number := JSON_RULE_START;
    FOR rule IN SELECT * FROM UNNEST(rules_data) LOOP
        INSERT INTO assessment_access_control (
            course_instance_id,
            assessment_id,
            number,
            enabled,
            block_access,
            list_before_release,
            target_type,
            date_control_overridden,
            date_control_release_date_overridden,
            date_control_release_date,
            date_control_due_date_overridden,
            date_control_due_date,
            date_control_early_deadlines_overridden,
            date_control_late_deadlines_overridden,
            date_control_after_last_deadline_allow_submissions,
            date_control_after_last_deadline_credit_overridden,
            date_control_after_last_deadline_credit,
            date_control_duration_minutes_overridden,
            date_control_duration_minutes,
            date_control_password_overridden,
            date_control_password,
            prairietest_control_overridden,
            after_complete_hide_questions,
            after_complete_show_questions_again_date_overridden,
            after_complete_show_questions_again_date,
            after_complete_hide_questions_again_date_overridden,
            after_complete_hide_questions_again_date,
            after_complete_hide_score,
            after_complete_show_score_again_date_overridden,
            after_complete_show_score_again_date
        ) VALUES (
            syncing_course_instance_id,
            syncing_assessment_id,
            rule_number,
            (rule ->> 'enabled')::boolean,
            (rule ->> 'block_access')::boolean,
            (rule ->> 'list_before_release')::boolean,
            (rule ->> 'target_type')::text,
            (rule ->> 'date_control_overridden')::boolean,
            (rule ->> 'date_control_release_date_overridden')::boolean,
            (rule ->> 'date_control_release_date')::timestamp with time zone,
            (rule ->> 'date_control_due_date_overridden')::boolean,
            (rule ->> 'date_control_due_date')::timestamp with time zone,
            (rule ->> 'date_control_early_deadlines_overridden')::boolean,
            (rule ->> 'date_control_late_deadlines_overridden')::boolean,
            (rule ->> 'date_control_after_last_deadline_allow_submissions')::boolean,
            (rule ->> 'date_control_after_last_deadline_credit_overridden')::boolean,
            (rule ->> 'date_control_after_last_deadline_credit')::integer,
            (rule ->> 'date_control_duration_minutes_overridden')::boolean,
            (rule ->> 'date_control_duration_minutes')::integer,
            (rule ->> 'date_control_password_overridden')::boolean,
            (rule ->> 'date_control_password')::text,
            (rule ->> 'prairietest_control_overridden')::boolean,
            (rule ->> 'after_complete_hide_questions')::boolean,
            (rule ->> 'after_complete_show_questions_again_date_overridden')::boolean,
            (rule ->> 'after_complete_show_questions_again_date')::timestamp with time zone,
            (rule ->> 'after_complete_hide_questions_again_date_overridden')::boolean,
            (rule ->> 'after_complete_hide_questions_again_date')::timestamp with time zone,
            (rule ->> 'after_complete_hide_score')::boolean,
            (rule ->> 'after_complete_show_score_again_date_overridden')::boolean,
            (rule ->> 'after_complete_show_score_again_date')::timestamp with time zone
        )
        ON CONFLICT (course_instance_id, assessment_id, number, target_type) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            block_access = EXCLUDED.block_access,
            list_before_release = EXCLUDED.list_before_release,
            target_type = EXCLUDED.target_type,
            date_control_overridden = EXCLUDED.date_control_overridden,
            date_control_release_date_overridden = EXCLUDED.date_control_release_date_overridden,
            date_control_release_date = EXCLUDED.date_control_release_date,
            date_control_due_date_overridden = EXCLUDED.date_control_due_date_overridden,
            date_control_due_date = EXCLUDED.date_control_due_date,
            date_control_early_deadlines_overridden = EXCLUDED.date_control_early_deadlines_overridden,
            date_control_late_deadlines_overridden = EXCLUDED.date_control_late_deadlines_overridden,
            date_control_after_last_deadline_allow_submissions = EXCLUDED.date_control_after_last_deadline_allow_submissions,
            date_control_after_last_deadline_credit_overridden = EXCLUDED.date_control_after_last_deadline_credit_overridden,
            date_control_after_last_deadline_credit = EXCLUDED.date_control_after_last_deadline_credit,
            date_control_duration_minutes_overridden = EXCLUDED.date_control_duration_minutes_overridden,
            date_control_duration_minutes = EXCLUDED.date_control_duration_minutes,
            date_control_password_overridden = EXCLUDED.date_control_password_overridden,
            date_control_password = EXCLUDED.date_control_password,
            prairietest_control_overridden = EXCLUDED.prairietest_control_overridden,
            after_complete_hide_questions = EXCLUDED.after_complete_hide_questions,
            after_complete_show_questions_again_date_overridden = EXCLUDED.after_complete_show_questions_again_date_overridden,
            after_complete_show_questions_again_date = EXCLUDED.after_complete_show_questions_again_date,
            after_complete_hide_questions_again_date_overridden = EXCLUDED.after_complete_hide_questions_again_date_overridden,
            after_complete_hide_questions_again_date = EXCLUDED.after_complete_hide_questions_again_date,
            after_complete_hide_score = EXCLUDED.after_complete_hide_score,
            after_complete_show_score_again_date_overridden = EXCLUDED.after_complete_show_score_again_date_overridden,
            after_complete_show_score_again_date = EXCLUDED.after_complete_show_score_again_date
        RETURNING id INTO new_rule_id;

        -- Insert child rows for this rule
        -- Student groups
        INSERT INTO assessment_access_control_student_labels (assessment_access_control_id, student_label_id)
        SELECT new_rule_id, (g ->> 1)::bigint
        FROM UNNEST(student_labels_data) AS g
        WHERE (g ->> 0)::integer = rule_number;

        -- Early deadlines
        INSERT INTO assessment_access_control_early_deadline (access_control_id, date, credit)
        SELECT new_rule_id, (d ->> 1)::timestamp with time zone, (d ->> 2)::integer
        FROM UNNEST(early_deadlines_data) AS d
        WHERE (d ->> 0)::integer = rule_number;

        -- Late deadlines
        INSERT INTO assessment_access_control_late_deadline (access_control_id, date, credit)
        SELECT new_rule_id, (d ->> 1)::timestamp with time zone, (d ->> 2)::integer
        FROM UNNEST(late_deadlines_data) AS d
        WHERE (d ->> 0)::integer = rule_number;

        -- PrairieTest exams
        INSERT INTO assessment_access_control_prairietest_exam (access_control_id, uuid, read_only)
        SELECT new_rule_id, (e ->> 1)::uuid, (e ->> 2)::boolean
        FROM UNNEST(prairietest_exams_data) AS e
        WHERE (e ->> 0)::integer = rule_number;

        rule_number := rule_number + 1;
    END LOOP;

    -- Step 3: Delete excess JSON rules (rules beyond what we just synced, but not enrollment rules)
    DELETE FROM assessment_access_control
    WHERE assessment_id = syncing_assessment_id
        AND number > max_json_rule_number
        AND number >= JSON_RULE_START
        AND target_type IN ('none', 'student_label');
END;
$$ LANGUAGE plpgsql VOLATILE;
