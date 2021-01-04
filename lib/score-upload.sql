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

-- BLOCK select_assessment_instance
SELECT
    ai.id AS assessment_instance_id
FROM
    assessment_instances AS ai
    JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = $instance_number
    AND u.uid = $uid;
