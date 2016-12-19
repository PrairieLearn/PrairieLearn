-- BLOCK insert_course_instance
INSERT INTO course_instances
        (course_id,  short_name,  long_name,  number, deleted_at)
VALUES ($course_id, $short_name, $long_name, $number, NULL)
ON CONFLICT (course_id, short_name) DO UPDATE
SET
    long_name = EXCLUDED.long_name,
    number = EXCLUDED.number,
    deleted_at = EXCLUDED.deleted_at
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
        (course_instance_id,  number,  role,  uids,          start_date,  end_date)
VALUES ($course_instance_id, $number, $role, $uids::TEXT[], $start_date, $end_date)
ON CONFLICT (number, course_instance_id) DO UPDATE
SET
    role = EXCLUDED.role,
    uids = EXCLUDED.uids,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date;

-- BLOCK delete_excess_course_instance_access_rules
DELETE FROM course_instance_access_rules
WHERE
    course_instance_id = $course_instance_id
    AND number > $last_number;
