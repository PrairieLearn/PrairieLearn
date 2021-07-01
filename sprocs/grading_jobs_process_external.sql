CREATE FUNCTION
    grading_jobs_process_external(
        grading_job_id bigint,
        score double precision,
        feedback jsonb,
        format_errors jsonb,
        received_time timestamptz,
        start_time timestamptz,
        finish_time timestamptz,
        new_gradable boolean
    ) RETURNS void
AS $$
DECLARE
    grading_job grading_jobs%rowtype;
    credit integer;
    variant_id bigint;
    instance_question_id bigint;
    assessment_instance_id bigint;
    new_correct boolean;
BEGIN
    PERFORM grading_jobs_lock(grading_job_id);

    -- ######################################################################
    -- get the variant and related objects

    SELECT * INTO grading_job FROM grading_jobs WHERE id = grading_job_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'no grading_job_id: %', grading_job_id; END IF;

    -- we must have a variant, but we might not have an assessment_instance
    SELECT s.credit,       v.id,                iq.id,                  ai.id
    INTO     credit, variant_id, instance_question_id, assessment_instance_id
    FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE gj.id = grading_job_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'could not find variant for grading_job_id = %', grading_job_id; END IF;

    -- ######################################################################
    -- check that everything is ok

    -- bail out if we don't need this grading result
    IF grading_job.grading_request_canceled_at IS NOT NULL THEN RETURN; END IF;

    -- Bail out if we've already done this grading. This could happen
    -- if the message queues double-process a message, for
    -- example. This is not involved in re-grading because we will
    -- make a separate grading_job for re-grades.
    IF grading_job.graded_at IS NOT NULL THEN RETURN; END IF;

    -- ######################################################################
    -- store the grading information

    IF new_gradable = FALSE THEN
        score := null;
        new_correct := null;
    ELSE
        new_correct := (score >= 1.0);
    END IF;

    UPDATE grading_jobs
    SET
        graded_at = now(),
        grading_received_at = received_time,
        grading_started_at = start_time,
        grading_finished_at = finish_time,
        gradable = new_gradable,
        score = grading_jobs_process_external.score,
        correct = new_correct,
        feedback = grading_jobs_process_external.feedback
    WHERE id = grading_job_id
    RETURNING *
    INTO grading_job;

    IF new_gradable = FALSE THEN
        UPDATE submissions
        SET
            gradable = FALSE,
            feedback = grading_jobs_process_external.feedback,
            format_errors = grading_jobs_process_external.format_errors,
            score = null,
            partial_scores = null
        WHERE id = grading_job.submission_id;

        IF assessment_instance_id IS NOT NULL THEN
            UPDATE instance_questions
            SET status = 'invalid'::enum_instance_question_status
            WHERE id = instance_question_id;
        END IF;
    ELSE
        UPDATE submissions
        SET
            graded_at = grading_job.graded_at,
            score = grading_job.score,
            correct = grading_job.correct,
            feedback = grading_job.feedback
        WHERE id = grading_job.submission_id;

        -- ######################################################################
        -- update all parent objects

        PERFORM variants_update_after_grading(variant_id, grading_job.correct);
        IF assessment_instance_id IS NOT NULL THEN
           PERFORM instance_questions_grade(instance_question_id, grading_job.score, grading_job.id, grading_job.auth_user_id);
           PERFORM assessment_instances_grade(assessment_instance_id, grading_job.auth_user_id, credit);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
