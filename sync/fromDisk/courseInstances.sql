-- BLOCK insert_course_instance
INSERT INTO course_instances
        (course_id,  uuid,  short_name,  long_name,  number,  display_timezone, deleted_at, show_generated_assessment_sd_reduction_config)
VALUES ($course_id, $uuid, $short_name, $long_name, $number, $display_timezone, NULL, $show_generated_assessment_sd_reduction_config)
ON CONFLICT (uuid) DO UPDATE
SET
    short_name = EXCLUDED.short_name,
    long_name = EXCLUDED.long_name,
    number = EXCLUDED.number,
    display_timezone = EXCLUDED.display_timezone,
    deleted_at = EXCLUDED.deleted_at,
    show_generated_assessment_sd_reduction_config = EXCLUDED.show_generated_assessment_sd_reduction_config
WHERE
    course_instances.course_id = $course_id
RETURNING *;

-- BLOCK soft_delete_unused_course_instances
UPDATE course_instances AS ci
SET
    deleted_at = CURRENT_TIMESTAMP
WHERE
    ci.course_id = $course_id
    AND ci.deleted_at IS NULL
    AND ci.id NOT IN (SELECT unnest($keep_course_instance_ids::integer[]));

-- BLOCK delete_unused_course_instance_access_rules
DELETE FROM course_instance_access_rules AS ciar
WHERE NOT EXISTS (
    SELECT * FROM course_instances AS ci
    WHERE ci.id = ciar.course_instance_id
    AND ci.deleted_at IS NULL
);

-- BLOCK insert_course_instance_access_rule
INSERT INTO course_instance_access_rules
    (course_instance_id,  number,  role,  uids,
    start_date,
    end_date,
    institution)
SELECT
    $course_instance_id, $number, $role, $uids::TEXT[],
    input_date($start_date, ci.display_timezone),
    input_date($end_date, ci.display_timezone),
    $institution
FROM
    course_instances AS ci
WHERE
    ci.id = $course_instance_id
ON CONFLICT (number, course_instance_id) DO UPDATE
SET
    role = EXCLUDED.role,
    uids = EXCLUDED.uids,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    institution = EXCLUDED.institution;

-- BLOCK delete_excess_course_instance_access_rules
DELETE FROM course_instance_access_rules
WHERE
    course_instance_id = $course_instance_id
    AND number > $last_number;
