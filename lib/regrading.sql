
-- BLOCK select_regrade_assessment_instance_info
SELECT
    assessment_instance_label(ai, a, aset),
    u.uid AS user_uid,
    ci.id AS course_instance_id,
    c.id AS course_id
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN users AS u USING (user_id)
WHERE
    ai.id = $assessment_instance_id
    AND a.id = $assessment_id;

-- BLOCK select_regrade_assessment_info
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
