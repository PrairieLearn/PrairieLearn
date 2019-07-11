-- BLOCK lookup_credential
SELECT
    *
FROM lti_credentials
WHERE
    consumer_key = $consumer_key
    AND deleted_at IS NULL;

-- BLOCK enroll
INSERT INTO enrollments AS e
        (user_id, course_instance_id, role)
(
    SELECT
        u.user_id, $course_instance_id, $role
    FROM
        users AS u
    WHERE
        u.user_id = $user_id
        AND check_course_instance_access($course_instance_id, $role, u.uid, $req_date)
)
ON CONFLICT (user_id, course_instance_id)
DO UPDATE SET role = $role
RETURNING e.id;

-- BLOCK upsert_current_link
INSERT INTO lti_links
    (course_instance_id, context_id, resource_link_id, resource_link_title, resource_link_description)
VALUES
    ($course_instance_id, $context_id, $resource_link_id, $resource_link_title, $resource_link_description)
ON CONFLICT (course_instance_id, context_id, resource_link_id) DO UPDATE
    SET resource_link_title=$resource_link_title, resource_link_description=$resource_link_description
RETURNING *
;

-- BLOCK upsert_outcome
INSERT INTO lti_outcomes
    (user_id, assessment_id, lis_result_sourcedid, lis_outcome_service_url, lti_credential_id) VALUES
    ($user_id, $assessment_id, $lis_result_sourcedid, $lis_outcome_service_url, $lti_credential_id)
ON CONFLICT (user_id, assessment_id)
DO UPDATE SET lis_result_sourcedid=$lis_result_sourcedid, lis_outcome_service_url=$lis_outcome_service_url
;
