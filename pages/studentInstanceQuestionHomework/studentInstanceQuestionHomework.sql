-- BLOCK select_issues
SELECT
    i.*,
    format_date_full_compact(date, ci.display_timezone) AS formatted_date
FROM
    issues AS i
    JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
WHERE
    i.instance_question_id = $instance_question_id
    AND i.user_id = $user_id
ORDER BY date DESC, id;
