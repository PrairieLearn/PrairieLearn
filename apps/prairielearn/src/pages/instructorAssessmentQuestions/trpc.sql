-- BLOCK select_question_by_qid
WITH
  issue_count AS (
    SELECT
      q.id AS question_id,
      count(*) AS open_issue_count
    FROM
      issues AS i
      JOIN questions AS q ON (q.id = i.question_id)
    WHERE
      q.qid = $qid
      AND q.course_id = $course_id
      AND i.course_caused
      AND i.open
    GROUP BY
      q.id
  )
SELECT
  to_jsonb(q.*) AS question,
  to_jsonb(top.*) AS topic,
  coalesce(ic.open_issue_count, 0)::integer AS open_issue_count,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          t.*
          ORDER BY
            t.name
        )
      FROM
        tags t
        JOIN question_tags qt ON qt.tag_id = t.id
      WHERE
        qt.question_id = q.id
    ),
    '[]'::jsonb
  ) AS tags
FROM
  questions AS q
  JOIN topics AS top ON (top.id = q.topic_id)
  LEFT JOIN issue_count AS ic ON (ic.question_id = q.id)
WHERE
  q.course_id = $course_id
  AND q.qid = $qid
  AND q.deleted_at IS NULL;
