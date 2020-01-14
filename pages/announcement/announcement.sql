-- BLOCK select_announcement_for_read
WITH mark_announcement_as_read AS (
    DELETE FROM announcement_notifications
    WHERE
        announcement_id = $announcement_id
        AND user_id = $user_id
)
SELECT
    ann.*,
    format_date_only_no_tz(ann.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date
FROM
    announcements AS ann,
    course_instances AS ci,
    pl_courses AS c
WHERE
    ann.id = $announcement_id
    AND ci.id = $course_instance_id
    AND c.id = $course_id;

-- BLOCK select_announcement
SELECT *
FROM announcements
WHERE id = $announcement_id;
