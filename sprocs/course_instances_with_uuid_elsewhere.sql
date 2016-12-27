CREATE OR REPLACE FUNCTION course_instances_with_uuid_elsewhere(
        course_id INTEGER,
        uuid UUID
    ) RETURNS SETOF course_instances
AS $$
BEGIN
    RETURN QUERY
    SELECT
        *
    FROM
        course_instances AS ci
    WHERE
        ci.uuid = course_instances_with_uuid_elsewhere.uuid
        AND ci.course_id != course_instances_with_uuid_elsewhere.course_id;
END
$$ LANGUAGE plpgsql;
