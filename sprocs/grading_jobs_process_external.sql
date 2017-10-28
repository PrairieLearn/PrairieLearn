CREATE OR REPLACE FUNCTION
    grading_jobs_process_external(
        grading_job_id bigint,
        score double precision,
        feedback jsonb,
        start_time timestamptz,
        finish_time timestamptz
    ) RETURNS void
AS $$
DECLARE
    grading_job grading_jobs%rowtype;
    credit integer;
    variant_id bigint;
    instance_question_id bigint;
    assessment_instance_id bigint;
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

    UPDATE grading_jobs
    SET
        graded_at = now(),
        grading_started_at = start_time,
        grading_finished_at = finish_time,
        score = grading_jobs_process_external.score,
        correct = (grading_jobs_process_external.score >= 1.0),
        feedback = grading_jobs_process_external.feedback
    WHERE id = grading_job_id
    RETURNING *
    INTO grading_job;

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
        PERFORM instance_questions_grade(instance_question_id, grading_job.score, grading_job.auth_user_id, grading_job.id);
        PERFORM assessment_instances_grade(assessment_instance_id, grading_job.auth_user_id, credit);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
