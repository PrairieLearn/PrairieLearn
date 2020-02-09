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
        jsonb_agg(ci.* ORDER BY d.start_date DESC NULLS LAST, d.end_date DESC NULLS LAST, ci.id DESC)
    INTO
        course_instances_instructor_can_view.course_instances
    FROM
        course_instances AS ci
        LEFT JOIN LATERAL authz_course_instance(user_id, ci.id, is_administrator, req_date) AS aci ON TRUE,
        LATERAL (SELECT min(ar.start_date) AS start_date, max(ar.end_date) AS end_date FROM course_instance_access_rules AS ar WHERE ar.course_instance_id = ci.id) AS d
    WHERE
        ci.course_id = course_instances_instructor_can_view.course_id
        AND ci.deleted_at IS NULL
        AND (aci->>'has_instructor_view')::BOOLEAN;
END;
$$ LANGUAGE plpgsql VOLATILE;
