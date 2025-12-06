-- There are three time ranges:
-- 1. "active": $active_start to $term_end (this is the time range when we count active enrollments)
-- 2. "term": $term_start to $term_end (this is the true term time range, for determining term ratios)
-- 3. "total": $total_start to $total_end (this is the time range for detecting usage outside of the term)
WITH
  -- Select all usage data for the given institution(s) and the active time range.
  active_course_instance_usages AS (
    SELECT
      ciu.*
    FROM
      institutions AS i
      JOIN course_instance_usages AS ciu ON (ciu.institution_id = i.id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name::text = ''
        OR $institution_short_name::text IS NULL
      )
      AND ciu.date BETWEEN $active_start AND $term_end
  ),
  -- Select all usage data for the given institution(s) and the term time range.
  term_course_instance_usages AS (
    SELECT
      ciu.*
    FROM
      institutions AS i
      JOIN course_instance_usages AS ciu ON (ciu.institution_id = i.id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name::text = ''
        OR $institution_short_name::text IS NULL
      )
      AND ciu.date BETWEEN $term_start AND $term_end
  ),
  -- Select all usage data for the given institution(s) and the total time range.
  total_course_instance_usages AS (
    SELECT
      ciu.*
    FROM
      institutions AS i
      JOIN course_instance_usages AS ciu ON (ciu.institution_id = i.id)
    WHERE
      (
        i.short_name = $institution_short_name::text
        OR $institution_short_name::text = ''
        OR $institution_short_name::text IS NULL
      )
      AND ciu.date BETWEEN $total_start AND $total_end
  ),
  -- Calculate the student usage data in the active time range.
  student_active_data AS (
    SELECT
      ciu.course_id,
      ciu.course_instance_id,
      count(DISTINCT u.user_id) AS total_students,
      count(DISTINCT u.user_id) FILTER (
        WHERE
          u.institution_id != i.id
      ) AS outside_students
    FROM
      active_course_instance_usages AS ciu
      JOIN institutions AS i ON (i.id = ciu.institution_id)
      JOIN users AS u ON (u.user_id = ciu.user_id)
    WHERE
      ciu.include_in_statistics
    GROUP BY
      ciu.course_id,
      ciu.course_instance_id
  ),
  -- Calculate the student usage data in the term time range.
  student_term_data AS (
    SELECT
      ciu.course_id,
      ciu.course_instance_id,
      count(*) FILTER (
        WHERE
          ciu.type = 'Submission'
      ) AS term_submissions,
      EXTRACT(
        EPOCH
        FROM
          sum(ciu.duration) FILTER (
            WHERE
              ciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(ciu.duration) FILTER (
            WHERE
              ciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours
    FROM
      term_course_instance_usages AS ciu
      JOIN institutions AS i ON (i.id = ciu.institution_id)
      JOIN users AS u ON (u.user_id = ciu.user_id)
    WHERE
      ciu.include_in_statistics
    GROUP BY
      ciu.course_id,
      ciu.course_instance_id
  ),
  -- Calculate the student usage data in the total time range.
  student_total_data AS (
    SELECT
      ciu.course_id,
      ciu.course_instance_id,
      count(*) FILTER (
        WHERE
          ciu.type = 'Submission'
      ) AS total_submissions
    FROM
      total_course_instance_usages AS ciu
      JOIN institutions AS i ON (i.id = ciu.institution_id)
      JOIN users AS u ON (u.user_id = ciu.user_id)
    WHERE
      ciu.include_in_statistics
    GROUP BY
      ciu.course_id,
      ciu.course_instance_id
  ),
  -- Aggregate the student data usage and compute the "submission term ratio"
  -- for each course instance. This is the ratio of submissions that occured
  -- within the term to the total submissions over all time.
  student_course_instances_usage_data AS (
    SELECT
      active.course_id,
      active.course_instance_id,
      NULL::bigint AS total_staff,
      active.total_students,
      active.outside_students,
      term.term_submissions,
      total.total_submissions,
      term.term_submissions::float / greatest(1, total.total_submissions::float) AS submission_term_ratio,
      term.external_grading_hours,
      term.workspace_hours,
      NULL::double precision AS cost_ai_question_generation,
      NULL::double precision AS cost_ai_grading
    FROM
      student_active_data AS active
      JOIN student_term_data AS term ON (
        term.course_id = active.course_id
        AND term.course_instance_id = active.course_instance_id
      )
      JOIN student_total_data AS total ON (
        total.course_id = active.course_id
        AND total.course_instance_id = active.course_instance_id
      )
  ),
  -- Now we get the staff usage data. This is all data with
  -- `include_in_statistics` set to false. We also set the `total_students` and
  -- `outside_students` to NULL for the later UNION. This staff data might or
  -- might not have a `course_instance_id`, depending on whether the usage was
  -- within a course instance context, but we display all staff usage only at
  -- the course level, so we set the `course_instance_id` to NULL.
  staff_courses_usage_data AS (
    SELECT
      ciu.course_id,
      NULL::bigint AS course_instance_id,
      count(DISTINCT ciu.user_id) AS total_staff,
      NULL::bigint AS total_students,
      NULL::bigint AS outside_students,
      NULL::bigint AS term_submissions,
      NULL::bigint AS total_submissions,
      NULL::float AS submission_term_ratio,
      EXTRACT(
        EPOCH
        FROM
          sum(ciu.duration) FILTER (
            WHERE
              ciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(ciu.duration) FILTER (
            WHERE
              ciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours,
      sum(ciu.cost_ai_question_generation) AS cost_ai_question_generation,
      sum(ciu.cost_ai_grading) AS cost_ai_grading
    FROM
      term_course_instance_usages AS ciu
    WHERE
      NOT ciu.include_in_statistics
    GROUP BY
      ciu.course_id
  ),
  -- As the final step, we combine the student and staff usage data into a single
  -- table. The above queries are designed to have the same columns, so we can
  -- just UNION them together.
  combined_data AS (
    (
      SELECT
        *
      FROM
        student_course_instances_usage_data
    )
    UNION ALL
    (
      SELECT
        *
      FROM
        staff_courses_usage_data
    )
  )
SELECT
  i.short_name AS institution,
  c.short_name AS course,
  c.id AS course_id,
  ci.short_name AS course_instance,
  ci.id AS course_instance_id,
  -- is this course instance active?
  CASE
    WHEN ci.id IS NOT NULL
    AND cd.submission_term_ratio >= $minimum_term_ratio
    AND cd.total_students >= $minimum_student_count THEN 1
    ELSE NULL
  END AS active_instance,
  -- number of course staff
  cd.total_staff,
  -- total number of students
  cd.total_students,
  -- number of students from a different institution
  cd.outside_students,
  -- number of submissions in the active date range
  cd.term_submissions,
  -- number of submissions in the total date range
  cd.total_submissions,
  -- ratio of submissions in the term date range to total submissions
  cd.submission_term_ratio,
  -- running duration of external grading jobs (in hours)
  cd.external_grading_hours,
  -- running duration of workspaces (in hours)
  cd.workspace_hours,
  -- total compute time for both workspaces and external grading jobs (in hours)
  coalesce(cd.external_grading_hours, 0) + coalesce(cd.workspace_hours, 0) AS total_compute_hours,
  -- cost of AI question generation (in USD)
  cd.cost_ai_question_generation,
  -- cost of AI grading (in USD)
  cd.cost_ai_grading
FROM
  combined_data AS cd
  LEFT JOIN course_instances AS ci ON (ci.id = cd.course_instance_id)
  JOIN pl_courses AS c ON (c.id = cd.course_id)
  JOIN institutions AS i ON (i.id = c.institution_id)
ORDER BY
  i.short_name,
  i.id,
  c.short_name,
  c.id,
  ci.short_name,
  ci.id;
