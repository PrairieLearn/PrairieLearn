DROP FUNCTION IF EXISTS sync_news_items(jsonb);
DROP FUNCTION IF EXISTS sync_news_items(jsonb,boolean);

CREATE OR REPLACE FUNCTION
    sync_news_items (
        IN news_items_on_disk jsonb,
        IN notify_with_new_server boolean -- should we send notifications on a new server install (a blank DB)
    ) RETURNS void
AS $$
DECLARE
    existing_news_items_count bigint;
    new_uuids uuid[];
BEGIN
    -- Save the number of existing news items
    SELECT count(*) from news_items
    INTO existing_news_items_count;

    -- Save the list of new UUIDs
    SELECT array_agg(uuid)
    FROM (
        SELECT uuid FROM jsonb_to_recordset(news_items_on_disk) AS aod(uuid uuid)
        EXCEPT
        SELECT uuid FROM news_items
    ) AS t
    INTO new_uuids;

    -- Make the DB news_items be the same as the on-disk news_items
    WITH new_news_items AS (
        INSERT INTO news_items
            (uuid, directory, title, author, visible_to_students, order_by)
        SELECT *
        FROM
            ROWS FROM(
                jsonb_to_recordset(news_items_on_disk)
                AS (uuid uuid, directory text, title text, author text, visible_to_students boolean)
            ) WITH ORDINALITY AS aod(uuid, directory, title, author, visible_to_students, order_by)
        ON CONFLICT (uuid) DO UPDATE
        SET
            directory = EXCLUDED.directory,
            title = EXCLUDED.title,
            author = EXCLUDED.author,
            visible_to_students = EXCLUDED.visible_to_students,
            order_by = EXCLUDED.order_by
        RETURNING id
    )
    DELETE FROM news_items AS ni
    WHERE
        ni.id NOT IN (SELECT id FROM new_news_items);

    IF existing_news_items_count > 0   -- IF we are updating a existing server
    OR notify_with_new_server          -- OR we should notify on new servers
    THEN                               -- THEN send notifications
        WITH
        users_as_course_staff AS (
            -- This is a more efficient implementation of
            -- sprocs/users_is_course_staff for all users at once
            SELECT
                user_id,
                bool_or(
                    cp.course_role > 'None'
                    OR e.role > 'Student'
                    OR adm.id IS NOT NULL
                ) AS is_course_staff
            FROM
                users AS u
                LEFT JOIN course_permissions AS cp USING (user_id)
                LEFT JOIN enrollments AS e USING (user_id)
                LEFT JOIN administrators AS adm USING (user_id)
            GROUP BY user_id
        ),
        new_news_items AS (
            SELECT
                ni.id,
                ni.visible_to_students
            FROM
                news_items AS ni
                JOIN unnest(new_uuids) AS nu(uuid) USING (uuid)
        )
        INSERT INTO news_item_notifications (news_item_id, user_id)
        SELECT
            ni.id,
            u.user_id
        FROM
            new_news_items AS ni
            CROSS JOIN users_as_course_staff AS u
        WHERE
            ni.visible_to_students
            OR u.is_course_staff;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
