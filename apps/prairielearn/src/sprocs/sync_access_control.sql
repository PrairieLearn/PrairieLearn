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
    WHERE assessment_access_control_rule_id IN (
        SELECT id FROM assessment_access_control_rules
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_early_deadlines
    WHERE assessment_access_control_rule_id IN (
        SELECT id FROM assessment_access_control_rules
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_late_deadlines
    WHERE assessment_access_control_rule_id IN (
        SELECT id FROM assessment_access_control_rules
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    DELETE FROM assessment_access_control_prairietest_exams
    WHERE assessment_access_control_rule_id IN (
        SELECT id FROM assessment_access_control_rules
        WHERE assessment_id = ANY(syncing_assessment_ids) AND target_type IN ('none', 'student_label')
    );

    -- Delete rows where the target_type changed for a given (assessment, number)
    -- to avoid unique constraint conflicts (the conflict key includes target_type).
    DELETE FROM assessment_access_control_rules aacr
    USING UNNEST(rules_data) AS rule
    JOIN assessments a ON a.id = (rule ->> 'assessment_id')::bigint AND a.course_instance_id = syncing_course_instance_id
    WHERE aacr.assessment_id = (rule ->> 'assessment_id')::bigint
        AND aacr.number = (rule ->> 'number')::integer
        AND aacr.target_type != (rule ->> 'target_type')::enum_assessment_access_control_target_type
        AND aacr.target_type IN ('none', 'student_label');

    -- UPSERT all rules across all assessments in a single statement.
    INSERT INTO assessment_access_control_rules (
        assessment_id,
        number,
        list_before_release,
        target_type,
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
        (rule ->> 'assessment_id')::bigint,
        (rule ->> 'number')::integer,
        (rule ->> 'list_before_release')::boolean,
        (rule ->> 'target_type')::enum_assessment_access_control_target_type,
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

        (rule ->> 'after_complete_hide_questions')::boolean,
        (rule ->> 'after_complete_show_questions_again_date_overridden')::boolean,
        (rule ->> 'after_complete_show_questions_again_date')::timestamp with time zone,
        (rule ->> 'after_complete_hide_questions_again_date_overridden')::boolean,
        (rule ->> 'after_complete_hide_questions_again_date')::timestamp with time zone,
        (rule ->> 'after_complete_hide_score')::boolean,
        (rule ->> 'after_complete_show_score_again_date_overridden')::boolean,
        (rule ->> 'after_complete_show_score_again_date')::timestamp with time zone
    FROM UNNEST(rules_data) AS rule
    ON CONFLICT (assessment_id, number, target_type) DO UPDATE SET
        list_before_release = EXCLUDED.list_before_release,
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
    INSERT INTO assessment_access_control_student_labels (assessment_access_control_rule_id, student_label_id)
    SELECT aacr.id, (g ->> 2)::bigint
    FROM UNNEST(student_labels_data) AS g
    JOIN assessment_access_control_rules aacr ON
        aacr.assessment_id = (g ->> 0)::bigint
        AND aacr.number = (g ->> 1)::integer
        AND aacr.target_type = 'student_label'
    JOIN assessments a ON a.id = aacr.assessment_id AND a.course_instance_id = syncing_course_instance_id;

    -- Insert early deadlines.
    INSERT INTO assessment_access_control_early_deadlines (assessment_access_control_rule_id, date, credit)
    SELECT aacr.id, sub.date, sub.credit
    FROM (
        SELECT
            (d ->> 0)::bigint AS assessment_id,
            (d ->> 1)::integer AS rule_number,
            (d ->> 2)::timestamp with time zone AS date,
            (d ->> 3)::integer AS credit
        FROM UNNEST(early_deadlines_data) AS d
    ) sub
    JOIN assessment_access_control_rules aacr ON
        aacr.assessment_id = sub.assessment_id
        AND aacr.number = sub.rule_number
        AND aacr.target_type IN ('none', 'student_label')
    JOIN assessments a ON a.id = aacr.assessment_id AND a.course_instance_id = syncing_course_instance_id;

    -- Insert late deadlines.
    INSERT INTO assessment_access_control_late_deadlines (assessment_access_control_rule_id, date, credit)
    SELECT aacr.id, sub.date, sub.credit
    FROM (
        SELECT
            (d ->> 0)::bigint AS assessment_id,
            (d ->> 1)::integer AS rule_number,
            (d ->> 2)::timestamp with time zone AS date,
            (d ->> 3)::integer AS credit
        FROM UNNEST(late_deadlines_data) AS d
    ) sub
    JOIN assessment_access_control_rules aacr ON
        aacr.assessment_id = sub.assessment_id
        AND aacr.number = sub.rule_number
        AND aacr.target_type IN ('none', 'student_label')
    JOIN assessments a ON a.id = aacr.assessment_id AND a.course_instance_id = syncing_course_instance_id;

    -- Insert PrairieTest exams (main rules only).
    INSERT INTO assessment_access_control_prairietest_exams (assessment_access_control_rule_id, uuid, read_only)
    SELECT aacr.id, (e ->> 2)::uuid, (e ->> 3)::boolean
    FROM UNNEST(prairietest_exams_data) AS e
    JOIN assessment_access_control_rules aacr ON
        aacr.assessment_id = (e ->> 0)::bigint
        AND aacr.number = (e ->> 1)::integer
        AND aacr.target_type = 'none'
    JOIN assessments a ON a.id = aacr.assessment_id AND a.course_instance_id = syncing_course_instance_id;

    -- Delete excess rules: rules with number > max incoming number per assessment.
    DELETE FROM assessment_access_control_rules aacr
    USING (
        SELECT
            (rule ->> 'assessment_id')::bigint AS assessment_id,
            MAX((rule ->> 'number')::integer) AS max_number
        FROM UNNEST(rules_data) AS rule
        GROUP BY (rule ->> 'assessment_id')::bigint
    ) max_rules
    JOIN assessments a ON a.id = max_rules.assessment_id AND a.course_instance_id = syncing_course_instance_id
    WHERE aacr.assessment_id = max_rules.assessment_id
        AND aacr.number > max_rules.max_number
        AND aacr.target_type IN ('none', 'student_label');

    -- Delete ALL non-enrollment rules for assessments that have no incoming rules
    -- (either because they had errors or because their accessControl array is empty).
    DELETE FROM assessment_access_control_rules aacr
    USING assessments a
    WHERE a.id = aacr.assessment_id AND a.course_instance_id = syncing_course_instance_id
        AND aacr.assessment_id = ANY(syncing_assessment_ids)
        AND NOT EXISTS (
            SELECT 1 FROM UNNEST(rules_data) AS rule
            WHERE (rule ->> 'assessment_id')::bigint = aacr.assessment_id
        )
        AND aacr.target_type IN ('none', 'student_label');
END;
$$ LANGUAGE plpgsql VOLATILE;
