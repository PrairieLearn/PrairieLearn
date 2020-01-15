CREATE OR REPLACE FUNCTION
    course_instances_instructor_can_view (
        IN user_id bigint,
        IN is_administrator boolean,
        IN req_date timestamptz,
        IN course_id bigint,
        OUT course_instances jsonb
    )
AS $$
BEGIN
    SELECT
        jsonb_agg(ci.* ORDER BY ci.number DESC, ci.id)
    INTO
        course_instances_instructor_can_view.course_instances
    FROM
        course_instances AS ci
        LEFT JOIN LATERAL authz_course_instance(user_id, ci.id, is_administrator, req_date) AS aci ON TRUE
    WHERE
        ci.course_id = course_instances_instructor_can_view.course_id
        AND ci.deleted_at IS NULL
        AND (aci->>'has_instructor_view')::BOOLEAN;
END;
$$ LANGUAGE plpgsql VOLATILE;
