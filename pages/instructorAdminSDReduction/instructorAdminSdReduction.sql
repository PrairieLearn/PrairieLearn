-- BLOCK get_sd_reduction_status
SELECT
  ci.sd_reduction_status
FROM
  course_instances AS ci
WHERE
  ci.id = $course_instance_id;

-- BLOCK toggle_sd_reduction_status
WITH existing_status AS (
  SELECT
    ci.sd_reduction_status
  FROM
    course_instances AS ci
  WHERE
    ci.id = $course_instance_id
)
UPDATE
  course_instances AS ci
SET
  sd_reduction_status = NOT existing_status.sd_reduction_status
FROM
  existing_status
WHERE
  ci.id = $course_instance_id;