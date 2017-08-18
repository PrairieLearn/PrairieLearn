-- BLOCK errors_count
WITH counts AS (
    SELECT
        e.open,
        count(*)::int
    FROM errors AS e
    WHERE
        e.course_id = $course_id
        AND e.course_caused
    GROUP BY e.open
)
SELECT
    open,
    coalesce(count, 0) AS count
FROM
    (VALUES (true), (false)) AS tmp(open)
    LEFT JOIN counts USING (open)
ORDER BY open;

-- BLOCK select_errors
SELECT
    e.id AS error_id,
    e.display_id,
    format_date_full_compact(e.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    ci.short_name AS course_instance_short_name,
    CASE WHEN e.assessment_id IS NOT NULL THEN assessments_format(e.assessment_id) ELSE NULL END AS assessment,
    e.question_id,
    q.directory AS question_qid,
    u.uid AS user_uid,
    e.student_message,
    e.variant_id,
    e.open
FROM
    errors AS e
    JOIN pl_courses AS c ON (c.id = e.course_id)
    LEFT JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    LEFT JOIN assessments AS a ON (a.id = e.assessment_id)
    LEFT JOIN questions AS q ON (q.id = e.question_id)
    LEFT JOIN users AS u ON (u.user_id = e.user_id)
WHERE
    e.course_id = $course_id
    AND e.course_caused
    AND (($qid::text IS NULL) OR (q.qid = $qid::text))
ORDER BY
    e.date DESC, e.id
LIMIT
    $limit
OFFSET
    $offset;
