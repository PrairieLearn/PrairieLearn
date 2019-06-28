-- Accepts a course ID and a list of assessment UUIDs and ensures that they are
-- not in use by any other course instance. If a duplicate is found, the corresponding
-- UUID is returned to the caller. Stops checking for duplicates once a single
-- duplicate is found.

CREATE OR REPLACE FUNCTION
    sync_check_duplicate_assessment_uuids(
        IN assessment_uuids JSONB,
        IN course_instance_id bigint,
        OUT duplicate_uuid uuid
    )
AS $$
DECLARE
    assessment_uuid text;
BEGIN
    FOR assessment_uuid IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(assessment_uuids) LOOP
        SELECT
            a.uuid INTO duplicate_uuid
        FROM
            assessments AS a
        WHERE
            a.uuid = assessment_uuid::uuid
            AND a.course_instance_id != sync_check_duplicate_assessment_uuids.course_instance_id;
        EXIT WHEN FOUND;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE;
