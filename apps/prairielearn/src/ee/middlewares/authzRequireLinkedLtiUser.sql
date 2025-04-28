-- BLOCK select_lti13_instance_for_course_instance
SELECT
    li.*
FROM
    lti13_instances li
    JOIN lti13_course_instances lci ON lci.lti13_instance_id = li.id
WHERE
    lci.course_instance_id = $course_instance_id
    AND li.require_linked_lti_user = TRUE
    AND li.deleted_at IS NULL
LIMIT 1;

-- BLOCK check_user_has_linked_lti_account
SELECT
    EXISTS (
        SELECT 1
        FROM lti13_users lu
        WHERE
            lu.user_id = $user_id
            AND lu.lti13_instance_id = $lti13_instance_id
    ) AS has_linked_account;
