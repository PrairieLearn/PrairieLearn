--BLOCK config_info
SELECT id, course_instance_id, type, name, minimum, maximum
FROM group_configs
WHERE assessment_id = $assessment_id AND deleted_at IS NULL;

-- BLOCK select_groups
SELECT 
  GID,
  groupname,
  COUNT(*) AS num,
  array_to_string(array_agg(uid), ', ') AS uids
FROM (SELECT
        gr.id AS GID,
        gr.name AS groupname,
        us.uid AS uid
    FROM
        group_configs AS gc
        JOIN groups as gr ON (gc.id = gr.group_config_id)
        JOIN group_users as gu ON (gu.group_id = gr.id)
        JOIN users as us ON (us.user_id = gu.user_id)
    WHERE
        gc.assessment_id = $assessment_id
        AND gc.deleted_at IS NULL
        AND gr.deleted_at IS NULL
    ) temp
GROUP BY GID, groupname
ORDER BY GID, groupname;

-- BLOCK not_assigned_users
SELECT uid
FROM ((SELECT user_id
FROM 
    assessments AS a
    JOIN enrollments AS e ON e.course_instance_id = a.course_instance_id
WHERE a.id = $assessment_id AND e.role = 'Student')
EXCEPT
(SELECT user_id
FROM
    group_configs AS gc
    JOIN groups as gr ON (gc.id = gr.group_config_id)
    JOIN group_users as gu ON (gu.group_id = gr.id)
WHERE gc.assessment_id = $assessment_id AND gc.deleted_at IS NULL AND gr.deleted_at IS NULL)) temp
JOIN users u ON u.user_id = temp.user_id
ORDER BY uid;

-- BLOCK assessment_list
SELECT id, tid, title
FROM assessments
WHERE course_instance_id IN (SELECT course_instance_id
                            FROM assessments
                            WHERE id = $assessment_id)
ORDER BY tid;

--BLOCK config_group
UPDATE group_configs
    SET
        minimum = $minsize,
        maximum = $maxsize
    WHERE
        assessment_id = $assessment_id AND deleted_at IS NULL;
