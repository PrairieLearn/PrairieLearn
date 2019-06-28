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
    FOR question_uuid IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(question_uuids) LOOP
        SELECT
            q.uuid INTO duplicate_uuid
        FROM
            questions AS q
        WHERE
            q.uuid = question_uuid::uuid
            AND q.course_id != check_course_id;
        EXIT WHEN FOUND;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
