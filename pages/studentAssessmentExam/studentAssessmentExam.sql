-- BLOCK select_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai,
    (SELECT *
     FROM group_users AS gi 
     WHERE $user_id = gi.user_id) AS gid
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ((ai.group_id = gid.group_id) OR (ai.user_id = $user_id));
