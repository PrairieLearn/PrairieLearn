CREATE FUNCTION
    sync_enrollment_access_control(
        IN syncing_course_instance_id bigint,
        IN syncing_assessment_id bigint,
        IN rule_data jsonb,
        IN enrollment_ids bigint[],
        IN early_deadlines_data jsonb[],
        IN late_deadlines_data jsonb[]
    )
RETURNS bigint
AS $$
DECLARE
    existing_rule_id bigint;
    new_rule_id bigint;
    next_number integer;
    ci_timezone text;
BEGIN
    -- Lock the assessment row to serialize concurrent access control modifications.
    PERFORM id FROM assessments WHERE id = syncing_assessment_id FOR NO KEY UPDATE;

    SELECT display_timezone INTO ci_timezone FROM course_instances WHERE id = syncing_course_instance_id;

    -- Check if updating an existing rule (rule_data contains 'id')
    existing_rule_id := (rule_data ->> 'id')::bigint;

    IF existing_rule_id IS NOT NULL THEN
        -- Update existing enrollment rule
        UPDATE assessment_access_control_rules SET
            list_before_release = (rule_data ->> 'list_before_release')::boolean,
            date_control_release_date = input_date(rule_data ->> 'date_control_release_date', ci_timezone),
            date_control_due_date_overridden = (rule_data ->> 'date_control_due_date_overridden')::boolean,
            date_control_due_date = input_date(rule_data ->> 'date_control_due_date', ci_timezone),
            date_control_early_deadlines_overridden = (rule_data ->> 'date_control_early_deadlines_overridden')::boolean,
            date_control_late_deadlines_overridden = (rule_data ->> 'date_control_late_deadlines_overridden')::boolean,
            date_control_after_last_deadline_allow_submissions = (rule_data ->> 'date_control_after_last_deadline_allow_submissions')::boolean,
            date_control_after_last_deadline_credit_overridden = (rule_data ->> 'date_control_after_last_deadline_credit_overridden')::boolean,
            date_control_after_last_deadline_credit = (rule_data ->> 'date_control_after_last_deadline_credit')::integer,
            date_control_duration_minutes_overridden = (rule_data ->> 'date_control_duration_minutes_overridden')::boolean,
            date_control_duration_minutes = (rule_data ->> 'date_control_duration_minutes')::integer,
            date_control_password_overridden = (rule_data ->> 'date_control_password_overridden')::boolean,
            date_control_password = (rule_data ->> 'date_control_password')::text,

            after_complete_hide_questions = (rule_data ->> 'after_complete_hide_questions')::boolean,
            after_complete_show_questions_again_date_overridden = (rule_data ->> 'after_complete_show_questions_again_date_overridden')::boolean,
            after_complete_show_questions_again_date = input_date(rule_data ->> 'after_complete_show_questions_again_date', ci_timezone),
            after_complete_hide_questions_again_date_overridden = (rule_data ->> 'after_complete_hide_questions_again_date_overridden')::boolean,
            after_complete_hide_questions_again_date = input_date(rule_data ->> 'after_complete_hide_questions_again_date', ci_timezone),
            after_complete_hide_score = (rule_data ->> 'after_complete_hide_score')::boolean,
            after_complete_show_score_again_date_overridden = (rule_data ->> 'after_complete_show_score_again_date_overridden')::boolean,
            after_complete_show_score_again_date = input_date(rule_data ->> 'after_complete_show_score_again_date', ci_timezone)
        FROM assessments AS a
        WHERE assessment_access_control_rules.id = existing_rule_id
            AND assessment_access_control_rules.assessment_id = syncing_assessment_id
            AND a.id = assessment_access_control_rules.assessment_id
            AND a.course_instance_id = syncing_course_instance_id
            AND assessment_access_control_rules.target_type = 'enrollment'
        RETURNING assessment_access_control_rules.id INTO new_rule_id;

        IF new_rule_id IS NULL THEN
            RAISE EXCEPTION 'Access control rule % not found for assessment % in course instance %',
                existing_rule_id, syncing_assessment_id, syncing_course_instance_id;
        END IF;

        -- Delete old child rows
        DELETE FROM assessment_access_control_enrollments
        WHERE assessment_access_control_rule_id = new_rule_id;
        DELETE FROM assessment_access_control_early_deadlines
        WHERE assessment_access_control_rule_id = new_rule_id;
        DELETE FROM assessment_access_control_late_deadlines
        WHERE assessment_access_control_rule_id = new_rule_id;
    ELSE
        -- Get next available number for enrollment rules. Starts at 1 (not 0)
        -- because check_first_rule_is_none requires number=0 ⟺ target_type='none'.
        SELECT COALESCE(MAX(number), 0) + 1 INTO next_number
        FROM assessment_access_control_rules
        WHERE assessment_id = syncing_assessment_id AND target_type = 'enrollment';

        -- Insert new enrollment rule
        INSERT INTO assessment_access_control_rules (
            assessment_id,
            number,
            target_type,
            list_before_release,
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
        ) VALUES (
            syncing_assessment_id,
            next_number,
            'enrollment',
            (rule_data ->> 'list_before_release')::boolean,
            input_date(rule_data ->> 'date_control_release_date', ci_timezone),
            (rule_data ->> 'date_control_due_date_overridden')::boolean,
            input_date(rule_data ->> 'date_control_due_date', ci_timezone),
            (rule_data ->> 'date_control_early_deadlines_overridden')::boolean,
            (rule_data ->> 'date_control_late_deadlines_overridden')::boolean,
            (rule_data ->> 'date_control_after_last_deadline_allow_submissions')::boolean,
            (rule_data ->> 'date_control_after_last_deadline_credit_overridden')::boolean,
            (rule_data ->> 'date_control_after_last_deadline_credit')::integer,
            (rule_data ->> 'date_control_duration_minutes_overridden')::boolean,
            (rule_data ->> 'date_control_duration_minutes')::integer,
            (rule_data ->> 'date_control_password_overridden')::boolean,
            (rule_data ->> 'date_control_password')::text,

            (rule_data ->> 'after_complete_hide_questions')::boolean,
            (rule_data ->> 'after_complete_show_questions_again_date_overridden')::boolean,
            input_date(rule_data ->> 'after_complete_show_questions_again_date', ci_timezone),
            (rule_data ->> 'after_complete_hide_questions_again_date_overridden')::boolean,
            input_date(rule_data ->> 'after_complete_hide_questions_again_date', ci_timezone),
            (rule_data ->> 'after_complete_hide_score')::boolean,
            (rule_data ->> 'after_complete_show_score_again_date_overridden')::boolean,
            input_date(rule_data ->> 'after_complete_show_score_again_date', ci_timezone)
        ) RETURNING id INTO new_rule_id;
    END IF;

    -- Insert enrollment targets
    INSERT INTO assessment_access_control_enrollments (assessment_access_control_rule_id, enrollment_id)
    SELECT new_rule_id, unnest(enrollment_ids);

    -- Insert early deadlines
    INSERT INTO assessment_access_control_early_deadlines (assessment_access_control_rule_id, date, credit)
    SELECT new_rule_id, input_date(d ->> 'date', ci_timezone), (d ->> 'credit')::integer
    FROM UNNEST(early_deadlines_data) AS d;

    -- Insert late deadlines
    INSERT INTO assessment_access_control_late_deadlines (assessment_access_control_rule_id, date, credit)
    SELECT new_rule_id, input_date(d ->> 'date', ci_timezone), (d ->> 'credit')::integer
    FROM UNNEST(late_deadlines_data) AS d;

    RETURN new_rule_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
