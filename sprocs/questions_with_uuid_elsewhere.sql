DROP FUNCTION IF EXISTS questions_with_uuid_elsewhere(integer,uuid);

CREATE OR REPLACE FUNCTION
    questions_with_uuid_elsewhere(
        course_id bigint,
        uuid UUID
    ) RETURNS SETOF questions
AS $$
BEGIN
    RETURN QUERY
    SELECT
        *
    FROM
        questions AS q
    WHERE
        q.uuid = questions_with_uuid_elsewhere.uuid
        AND q.course_id != questions_with_uuid_elsewhere.course_id;
END
$$ LANGUAGE plpgsql;
