-- BLOCK select_news_item_for_read
WITH mark_news_item_as_read AS (
    DELETE FROM news_item_notifications
    WHERE
        news_item_id = $news_item_id
        AND user_id = $user_id
)
SELECT
    ni.*,
    format_date_only_no_tz(ni.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date
FROM
    news_items AS ni
    LEFT JOIN course_instances AS ci ON (ci.id = $course_instance_id)
    LEFT JOIN pl_courses AS c ON (c.id = $course_id)
WHERE
    ni.id = $news_item_id;

-- BLOCK select_news_item
SELECT *
FROM news_items
WHERE id = $news_item_id;
