CREATE OR REPLACE FUNCTION
    auth_instructor_assessment_instance (
        assessment_instance_id bigint,
        auth_action enum_auth_action,
        auth_data JSONB
    ) RETURNS TABLE (authorized boolean, auth_user_id bigint)
AS $$
SELECT
    aaci.*
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN LATERAL auth_instructor_course_instance(ci.id, 'Edit', auth_data) AS aaci ON TRUE
WHERE
    ai.id = auth_instructor_assessment_instance.assessment_instance_id
    AND a.deleted_at IS NULL;
$$ LANGUAGE SQL STABLE;
