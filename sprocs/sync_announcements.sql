DROP FUNCTION IF EXISTS sync_announcements(jsonb);

CREATE OR REPLACE FUNCTION
    sync_announcements (
        IN announcements_on_disk jsonb
    ) RETURNS void
AS $$
DECLARE
    new_uuids uuid[];
BEGIN
    -- save the list of new UUIDs
    SELECT array_agg(uuid)
    FROM (
        SELECT uuid FROM jsonb_to_recordset(announcements_on_disk) AS aod(uuid uuid)
        EXCEPT
        SELECT uuid FROM announcements
    ) AS t
    INTO new_uuids;

    -- make the DB announcements be the same as the on-disk announcements
    WITH new_announcements AS (
        INSERT INTO announcements
            (uuid, directory, title, for_students, order_by)
        SELECT *
        FROM
            ROWS FROM(
                jsonb_to_recordset(announcements_on_disk)
                AS (uuid uuid, directory text, title text, for_students boolean)
            ) WITH ORDINALITY AS aod(uuid, directory, title, for_students, order_by)
        ON CONFLICT (uuid) DO UPDATE
        SET
            directory = EXCLUDED.directory,
            title = EXCLUDED.title,
            for_students = EXCLUDED.for_students,
            order_by = EXCLUDED.order_by
        RETURNING id
    )
    DELETE FROM announcements AS ann
    WHERE
        ann.id NOT IN (SELECT id FROM new_announcements);

    -- add announcement notifications for instructors
    WITH
    instructors AS (
        SELECT DISTINCT user_id
        FROM
            users AS u
            LEFT JOIN course_permissions AS cp USING (user_id)
            LEFT JOIN enrollments AS e USING (user_id)
        WHERE
            cp.course_role > 'None'
            OR e.role > 'Student'
    ),
    new_announcements AS (
        SELECT ann.id
        FROM
            announcements AS ann
            JOIN unnest(new_uuids) AS nu(uuid) USING (uuid)
    )
    INSERT INTO announcement_notifications (announcement_id, user_id)
    SELECT new_announcements.id, instructors.user_id
    FROM new_announcements, instructors;
END;
$$ LANGUAGE plpgsql VOLATILE;
