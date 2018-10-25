ALTER TABLE variants ADD COLUMN IF NOT EXISTS formatted_date text;

--UPDATE variants AS v
--SET
--    formatted_date = format_date_full_compact(v.date, COALESCE(ci.display_timezone, c.display_timezone))
--FROM
--    course_instances AS ci
--    JOIN pl_courses AS c ON (c.id = ci.course_id)
--WHERE
--    v.course_instance_id = ci.id;
