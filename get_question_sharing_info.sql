-- docker exec -it mypl psql postgres -f PrairieLearn/get_question_sharing_info.sql > question_sharing_info.csv
COPY (
  SELECT
    *
  FROM
    (
      SELECT
        q.qid,
        q.shared_publicly,
        (
          SELECT
            jsonb_agg(ss.name)
          FROM
            sharing_set_questions AS ssq
            JOIN sharing_sets AS ss on (ss.id = ssq.sharing_set_id)
          WHERE
            ssq.question_id = q.id
        ) AS sharing_sets
      FROM
        questions AS q
      WHERE
        q.course_id = 2
        AND q.deleted_at IS NULL
      GROUP BY
        q.id
      ORDER BY
        q.qid
    ) as qs
  WHERE
    sharing_sets IS NOT NULL
    OR shared_publicly
) TO STDOUT
With
  (FORMAT CSV, HEADER);
