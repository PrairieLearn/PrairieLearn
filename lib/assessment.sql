-- BLOCK check_belongs
SELECT
    ai.id
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
    ai.id = $assessment_instance_id
    AND a.id = $assessment_id;


-- BLOCK select_assessment_for_grading_job
SELECT
    ai.id AS assessment_instance_id
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    gj.id = $grading_job_id;


-- BLOCK select_assessment_info
SELECT
    assessment_label(a, aset),
    ci.id AS course_instance_id,
    c.id AS course_id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
    a.id = $assessment_id;


-- BLOCK select_instances_to_grade
SELECT
    ai.id AS assessment_instance_id,
    ai.number AS instance_number,
    COALESCE(u.uid, 'group ' || g.name) AS username
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.deleted_at IS NULL)
    LEFT JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
    a.id = $assessment_id
    AND ai.open;

-- BLOCK unset_grading_needed
UPDATE assessment_instances AS ai
SET
    grading_needed = FALSE
WHERE
    ai.id = $assessment_instance_id;
