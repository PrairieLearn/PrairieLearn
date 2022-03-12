CREATE FUNCTION
    grading_jobs_update_after_grading(
        grading_job_id bigint,
        received_time timestamptz,
        start_time timestamptz,
        finish_time timestamptz,
        new_submitted_answer jsonb, -- NULL => no change
        new_format_errors jsonb,
        new_gradable boolean,
        new_broken boolean,
        new_params jsonb, -- NULL => no change
        new_true_answer jsonb, -- NULL => no change
        new_feedback jsonb,
        new_partial_scores jsonb,
        new_score double precision,
        new_v2_score double precision
    ) RETURNS void
AS $$
<<main>>
DECLARE
    grading_job grading_jobs%rowtype;
    credit integer;
    submission_id bigint;
    submission_date timestamptz;
    variant_id bigint;
    instance_question_id bigint;
    assessment_instance_id bigint;
    grading_method enum_grading_method;
    new_correct boolean;
BEGIN
    PERFORM grading_jobs_lock(grading_job_id);

    -- ######################################################################
    -- get the variant and related objects

    SELECT * INTO grading_job FROM grading_jobs WHERE id = grading_job_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'no grading_job_id: %', grading_job_id; END IF;

    -- we must have a variant, but we might not have an assessment_instance
    SELECT
        s.credit,
        s.id,
        s.date,
        v.id,
        q.grading_method,
        iq.id,
        ai.id
    INTO
        credit,
        submission_id,
        submission_date,
        variant_id,
        grading_method,
        instance_question_id,
        assessment_instance_id
    FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN questions AS q ON (q.id = v.question_id)
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

    -- Bail out if there's a newer submission that we performed any grading on.
    -- This only applies to student questions - that is, where there's an
    -- associated instance question. This prevents a race condition where we
    -- grade submissions in a different order than how they were saved.
    -- This does not impact instructors since there's no notion of an assessment
    -- to grade.
    PERFORM 1 FROM
        instance_questions AS iq
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE
        iq.id = main.instance_question_id
        AND s.id != submission_id
        AND s.date > submission_date
        AND s.grading_requested_at IS NOT NULL;

    IF FOUND THEN RETURN; END IF;

    -- ######################################################################
    -- store the grading information

    IF new_gradable = FALSE THEN
        new_score := null;
        new_partial_scores := null;
        new_correct := null;
    ELSE
        new_correct := (new_score >= 1.0);
    END IF;

    UPDATE submissions
    SET
        graded_at = now(),
        gradable = new_gradable,
        broken = new_broken,
        format_errors = new_format_errors,
        partial_scores = new_partial_scores,
        score = new_score,
        v2_score = new_v2_score,
        correct = new_correct,
        feedback = new_feedback,
        submitted_answer = COALESCE(new_submitted_answer, submitted_answer),
        grading_method = main.grading_method
    WHERE id = grading_job.submission_id;

    UPDATE variants AS v
    SET
        params = COALESCE(new_params, params),
        true_answer = COALESCE(new_true_answer, true_answer)
    WHERE v.id = variant_id;

    UPDATE grading_jobs
    SET
        graded_at = now(),
        -- For internally-graded questions, these three timestamps will be NULL
        -- in this sproc's params. For the first two, we'll reuse the existing
        -- values that were set in `grading_jobs_insert`, and for the finish
        -- timestamp, we'll use the current time.
        grading_received_at = COALESCE(received_time, grading_received_at),
        grading_started_at = COALESCE(start_time, grading_started_at),
        grading_finished_at = COALESCE(finish_time, now()),
        gradable = new_gradable,
        score = new_score,
        correct = new_correct,
        feedback = new_feedback
    WHERE id = grading_job_id
    RETURNING *
    INTO grading_job;

    IF new_gradable = FALSE THEN
        IF instance_question_id IS NOT NULL THEN
            UPDATE instance_questions
            SET status = 'invalid'::enum_instance_question_status
            WHERE id = instance_question_id;
        END IF;
    ELSE
        -- ######################################################################
        -- update all parent objects

        PERFORM variants_update_after_grading(variant_id, grading_job.correct);
        IF instance_question_id IS NOT NULL THEN
           PERFORM instance_questions_grade(instance_question_id, grading_job.score, grading_job.id, grading_job.auth_user_id);
           PERFORM assessment_instances_grade(assessment_instance_id, grading_job.auth_user_id, credit);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
