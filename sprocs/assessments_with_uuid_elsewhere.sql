DROP FUNCTION IF EXISTS assessments_with_uuid_elsewhere(integer,uuid);

CREATE OR REPLACE FUNCTION
    assessments_with_uuid_elsewhere(
        course_instance_id bigint,
        uuid UUID
    ) RETURNS SETOF assessments
AS $$
BEGIN
    RETURN QUERY
    SELECT
        *
    FROM
        assessments AS a
    WHERE
        a.uuid = assessments_with_uuid_elsewhere.uuid
        AND a.course_instance_id != assessments_with_uuid_elsewhere.course_instance_id;
END
$$ LANGUAGE plpgsql STABLE;
