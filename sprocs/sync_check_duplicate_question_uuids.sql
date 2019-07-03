-- Accepts a course ID and a list of question UUIDs and ensures that they are
-- not in use by any other course. If a duplicate is found, the corresponding
-- UUID is returned to the caller. Stops checking for duplicates once a single
-- duplicate is found.

CREATE OR REPLACE FUNCTION
    sync_check_duplicate_question_uuids(
        IN question_uuids JSONB,
        IN check_course_id bigint,
        OUT duplicate_uuid uuid
    )
AS $$
DECLARE
    question_uuid text;
BEGIN
    SELECT
        q.uuid INTO duplicate_uuid
    FROM
        questions AS q
    WHERE
        q.uuid IN (
            SELECT UNNEST(
                (SELECT
                    ARRAY_AGG(uuids)::uuid[]
                FROM
                    JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(question_uuids, '[]')::jsonb) uuids
                    )::uuid[]
            )
        )
        AND q.course_id != check_course_id;
END;
$$ LANGUAGE plpgsql STABLE;
