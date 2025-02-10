WITH
  institution_data AS (
    SELECT
      ciu.institution_id,
      count(DISTINCT ciu.user_id) AS users,
      EXTRACT(
        EPOCH
        FROM
          sum(
            ciu.duration
            WHERE
              ciu.type = 'External grading'
          )
      ) / 3600 AS external_grading_hours,
      EXTRACT(
        EPOCH
        FROM
          sum(
            ciu.duration
            WHERE
              ciu.type = 'Workspace'
          )
      ) / 3600 AS workspace_hours
    FROM
      course_instance_usages AS ciu
    WHERE
      ciu.date BETWEEN $start_date AND $end_date
    GROUP BY
      i.id
  )
SELECT
  i.short_name AS institution,
  id.users,
  id.external_grading_hours,
  id.workspace_hours
FROM
  insitution_data AS id
  JOIN institutions AS i ON (i.id = id.institution_id)
ORDER BY
  i.short_name,
  i.id;
