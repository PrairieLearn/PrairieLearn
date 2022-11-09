-- BLOCK get_course_sharing_info
SELECT sharing_name, sharing_id
FROM pl_courses
WHERE id = $course_id


-- BLOCK select_sharing_sets
SELECT
    ss.name,
    ss.id,
    jsonb_agg(jsonb_build_object(
        'course_id', c.id,
        'short_name', c.short_name --maybe should use c.sharing_name here instead?
    ) ORDER BY c.short_name) AS shared_with
FROM
    sharing_sets AS ss
    JOIN course_sharing_sets AS css on css.sharing_set_id = ss.id
    JOIN pl_courses AS c on c.id = css.course_id
WHERE
    ss.course_id = $course_id
GROUP BY
    ss.id
ORDER BY
    ss.name;


-- BLOCK update_sharing_id
UPDATE pl_courses
SET sharing_id = $sharing_id
WHERE id = $course_id;
