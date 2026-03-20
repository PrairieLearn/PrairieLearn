CREATE FUNCTION
    sync_access_control(
        IN syncing_course_instance_id bigint,
        IN syncing_assessment_ids bigint[],
        IN rules_data jsonb[],
        IN student_labels_data jsonb[],
        IN early_deadlines_data jsonb[],
        IN late_deadlines_data jsonb[],
        IN prairietest_exams_data jsonb[]
    )
RETURNS void
AS $$
BEGIN
    -- Delete all child rows for rules being synced (non-enrollment types only).
    -- This covers both rules that will be updated and excess rules that will be
    -- deleted, so FK cascades don't need to handle it.
    DELETE FROM assessment_access_control_student_labels
    WHERE assessment_access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_early_deadline
    WHERE assessment_access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_late_deadline
    WHERE assessment_access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_prairietest_exam
    WHERE assessment_access_control_id IN (
        SELECT id FROM assessment_access_control
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    -- Delete rows where the target_type changed for a given (assessment, number)
    -- to avoid unique constraint conflicts (the conflict key includes target_type).
    DELETE FROM assessment_access_control aac
    USING UNNEST(rules_data) AS rule
    WHERE aac.assessment_id = (rule ->> 'assessment_id')::bigint
        AND aac.course_instance_id = syncing_course_instance_id
        AND aac.number = (rule ->> 'number')::integer
        AND aac.target_type != (rule ->> 'target_type')::enum_assessment_access_control_target_type
        AND aac.target_type IN ('none', 'student_label');

    -- UPSERT all rules across all assessments in a single statement.
    INSERT INTO assessment_access_control (
        course_instance_id,
        assessment_id,
        number,
        enabled,
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
        integrations_prairietest_overridden,
        after_complete_hide_questions,
        after_complete_show_questions_again_date_overridden,
        after_complete_show_questions_again_date,
        after_complete_hide_questions_again_date_overridden,
        after_complete_hide_questions_again_date,
        after_complete_hide_score,
        after_complete_show_score_again_date_overridden,
        after_complete_show_score_again_date
    )
    SELECT
        syncing_course_instance_id,
        (rule ->> 'assessment_id')::bigint,
        (rule ->> 'number')::integer,
        (rule ->> 'enabled')::boolean,
        (rule ->> 'list_before_release')::boolean,
        (rule ->> 'target_type')::enum_assessment_access_control_target_type,
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
        (rule ->> 'integrations_prairietest_overridden')::boolean,
        (rule ->> 'after_complete_hide_questions')::boolean,
        (rule ->> 'after_complete_show_questions_again_date_overridden')::boolean,
        (rule ->> 'after_complete_show_questions_again_date')::timestamp with time zone,
        (rule ->> 'after_complete_hide_questions_again_date_overridden')::boolean,
        (rule ->> 'after_complete_hide_questions_again_date')::timestamp with time zone,
        (rule ->> 'after_complete_hide_score')::boolean,
        (rule ->> 'after_complete_show_score_again_date_overridden')::boolean,
        (rule ->> 'after_complete_show_score_again_date')::timestamp with time zone
    FROM UNNEST(rules_data) AS rule
    ON CONFLICT (course_instance_id, assessment_id, number, target_type) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        list_before_release = EXCLUDED.list_before_release,
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
        integrations_prairietest_overridden = EXCLUDED.integrations_prairietest_overridden,
        after_complete_hide_questions = EXCLUDED.after_complete_hide_questions,
        after_complete_show_questions_again_date_overridden = EXCLUDED.after_complete_show_questions_again_date_overridden,
        after_complete_show_questions_again_date = EXCLUDED.after_complete_show_questions_again_date,
        after_complete_hide_questions_again_date_overridden = EXCLUDED.after_complete_hide_questions_again_date_overridden,
        after_complete_hide_questions_again_date = EXCLUDED.after_complete_hide_questions_again_date,
        after_complete_hide_score = EXCLUDED.after_complete_hide_score,
        after_complete_show_score_again_date_overridden = EXCLUDED.after_complete_show_score_again_date_overridden,
        after_complete_show_score_again_date = EXCLUDED.after_complete_show_score_again_date;

    -- Insert student labels by joining on (assessment_id, number) to resolve the
    -- access control ID. Student labels always have target_type='student_label'.
    INSERT INTO assessment_access_control_student_labels (assessment_access_control_id, student_label_id)
    SELECT aac.id, (g ->> 2)::bigint
    FROM UNNEST(student_labels_data) AS g
    JOIN assessment_access_control aac ON
        aac.course_instance_id = syncing_course_instance_id
        AND aac.assessment_id = (g ->> 0)::bigint
        AND aac.number = (g ->> 1)::integer
        AND aac.target_type = 'student_label';

    -- Insert early deadlines with correct per-rule sort_order using
    -- row_number() partitioned by (assessment_id, rule_number).
    INSERT INTO assessment_access_control_early_deadline (assessment_access_control_id, date, credit, sort_order)
    SELECT aac.id, sub.date, sub.credit, sub.sort_order
    FROM (
        SELECT
            (d ->> 0)::bigint AS assessment_id,
            (d ->> 1)::integer AS rule_number,
            (d ->> 2)::timestamp with time zone AS date,
            (d ->> 3)::integer AS credit,
            row_number() OVER (
                PARTITION BY (d ->> 0)::bigint, (d ->> 1)::integer
                ORDER BY ordinality
            ) - 1 AS sort_order
        FROM UNNEST(early_deadlines_data) WITH ORDINALITY AS d
    ) sub
    JOIN assessment_access_control aac ON
        aac.course_instance_id = syncing_course_instance_id
        AND aac.assessment_id = sub.assessment_id
        AND aac.number = sub.rule_number
        AND aac.target_type IN ('none', 'student_label');

    -- Insert late deadlines with correct per-rule sort_order.
    INSERT INTO assessment_access_control_late_deadline (assessment_access_control_id, date, credit, sort_order)
    SELECT aac.id, sub.date, sub.credit, sub.sort_order
    FROM (
        SELECT
            (d ->> 0)::bigint AS assessment_id,
            (d ->> 1)::integer AS rule_number,
            (d ->> 2)::timestamp with time zone AS date,
            (d ->> 3)::integer AS credit,
            row_number() OVER (
                PARTITION BY (d ->> 0)::bigint, (d ->> 1)::integer
                ORDER BY ordinality
            ) - 1 AS sort_order
        FROM UNNEST(late_deadlines_data) WITH ORDINALITY AS d
    ) sub
    JOIN assessment_access_control aac ON
        aac.course_instance_id = syncing_course_instance_id
        AND aac.assessment_id = sub.assessment_id
        AND aac.number = sub.rule_number
        AND aac.target_type IN ('none', 'student_label');

    -- Insert PrairieTest exams.
    INSERT INTO assessment_access_control_prairietest_exam (assessment_access_control_id, uuid, read_only)
    SELECT aac.id, (e ->> 2)::uuid, (e ->> 3)::boolean
    FROM UNNEST(prairietest_exams_data) AS e
    JOIN assessment_access_control aac ON
        aac.course_instance_id = syncing_course_instance_id
        AND aac.assessment_id = (e ->> 0)::bigint
        AND aac.number = (e ->> 1)::integer
        AND aac.target_type IN ('none', 'student_label');

    -- Delete excess rules: rules with number > max incoming number per assessment.
    DELETE FROM assessment_access_control aac
    USING (
        SELECT
            (rule ->> 'assessment_id')::bigint AS assessment_id,
            MAX((rule ->> 'number')::integer) AS max_number
        FROM UNNEST(rules_data) AS rule
        GROUP BY (rule ->> 'assessment_id')::bigint
    ) max_rules
    WHERE aac.assessment_id = max_rules.assessment_id
        AND aac.course_instance_id = syncing_course_instance_id
        AND aac.number > max_rules.max_number
        AND aac.target_type IN ('none', 'student_label');

    -- Delete ALL non-enrollment rules for assessments that have no incoming rules
    -- (either because they had errors or because their accessControl array is empty).
    DELETE FROM assessment_access_control aac
    WHERE aac.assessment_id = ANY(syncing_assessment_ids)
        AND aac.course_instance_id = syncing_course_instance_id
        AND NOT EXISTS (
            SELECT 1 FROM UNNEST(rules_data) AS rule
            WHERE (rule ->> 'assessment_id')::bigint = aac.assessment_id
        )
        AND aac.target_type IN ('none', 'student_label');
END;
$$ LANGUAGE plpgsql VOLATILE;
