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

-- BLOCK select_enrollments
SELECT 
    uid AS user_list
FROM 
    assessments AS a
    JOIN enrollments AS e ON e.course_instance_id = a.course_instance_id
    JOIN users u ON u.user_id = e.user_id
WHERE 
    a.id = $assessment_id AND e.role = 'Student';

-- BLOCK select_not_assigned
SELECT 
    uid AS user_list
FROM 
    ((SELECT 
        user_id
    FROM 
        assessments AS a
        JOIN enrollments AS e ON e.course_instance_id = a.course_instance_id
    WHERE 
        a.id = $assessment_id AND e.role = 'Student')
    EXCEPT
    (SELECT 
        user_id
    FROM
        group_configs AS gc
        JOIN groups as gr ON (gc.id = gr.group_config_id)
        JOIN group_users as gu ON (gu.group_id = gr.id)
    WHERE 
        gc.assessment_id = $assessment_id AND gc.deleted_at IS NULL AND gr.deleted_at IS NULL)) temp
JOIN
    users u ON u.user_id = temp.user_id;
