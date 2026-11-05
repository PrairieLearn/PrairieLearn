-- BLOCK create_reader_login
-- Roles are cluster-wide, so parallel test workers may race to create it.
DO $$
BEGIN
  CREATE ROLE pl_course_agent_test LOGIN IN ROLE course_agent_reader;
EXCEPTION
  WHEN duplicate_object OR unique_violation THEN NULL;
END
$$;

-- BLOCK count_course_instances
SELECT
  count(*)::integer
FROM
  course_instances
WHERE
  course_id = $course_id
  AND deleted_at IS NULL;

-- BLOCK set_claims
SELECT
  set_config('course_agent.claims', $1, false);

-- BLOCK count_visible_course_instances
SELECT
  count(*)::integer AS count
FROM
  course_instances;
