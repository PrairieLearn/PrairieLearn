-- BLOCK get_all_submissions
SELECT * FROM submissions;

-- BLOCK get_instance_question
SELECT *
FROM instance_questions
WHERE id = $id;

-- BLOCK get_users_manual_grading
SELECT *
FROM users_manual_grading
WHERE instance_question_id = $instance_question_id;

-- BLOCK get_conflict_grading_jobs_by_iq
SELECT *
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

-- BLOCK get_user_by_uin
SELECT *
FROM users
WHERE uin = $uin;

-- BLOCK get_assessment_question
SELECT *
FROM assessment_questions
WHERE id = $id;
