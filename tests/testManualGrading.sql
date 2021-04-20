-- BLOCK get_all_submissions
SELECT * FROM submissions;

-- BLOCK get_instance_question
SELECT *
FROM instance_questions
WHERE id = $id;

-- BLOCK get_conflict_grading_jobs_by_iq
SELECT gj.*
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
    iq.id = $id
    AND gj.manual_grading_conflict IS TRUE;

-- BLOCK get_grading_jobs_by_iq
SELECT *
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
    iq.id = $id;

-- BLOCK get_assessment_question
SELECT *
FROM assessment_questions
WHERE id = $id;

-- BLOCK set_last_date_started_by_user
WITH specified_user AS (
	SELECT user_id
	FROM users
	WHERE uid = $uid
)
UPDATE users_manual_grading AS umg
SET date_started = $dateTime
FROM specified_user
WHERE
	instance_question_id = $instanceQuestionId
	AND umg.user_id = specified_user.user_id;

-- BLOCK set_all_date_started_by_iq
UPDATE users_manual_grading
SET date_started = $dateTime
WHERE
	instance_question_id = $instanceQuestionId;

-- BLOCK get_user
SELECT *
FROM users
WHERE
    uid = $uid;

-- BLOCK get_grading_job_manual_grader
SELECT u.*
FROM
    grading_jobs AS gj
    JOIN users AS u ON (gj.auth_user_id = u.user_id)
WHERE
    gj.id = $gradingJobId;
