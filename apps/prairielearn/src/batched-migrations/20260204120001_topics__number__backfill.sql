-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  topics;

-- BLOCK update_topics_number
WITH
  numbered_topics AS (
    SELECT
      t.id,
      COALESCE(
        (
          SELECT
            MAX(number)
          FROM
            topics
          WHERE
            course_id = t.course_id
        ),
        0
      ) + ROW_NUMBER() OVER (
        PARTITION BY
          t.course_id
        ORDER BY
          t.id
      ) AS new_number
    FROM
      topics t
    WHERE
      t.id >= $start
      AND t.id <= $end
      AND t.number IS NULL
  )
UPDATE topics
SET
  number = numbered_topics.new_number
FROM
  numbered_topics
WHERE
  topics.id = numbered_topics.id;
