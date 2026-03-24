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
  to_jsonb(c.*) AS course,
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
  JOIN courses AS c ON (c.id = q.course_id)
  LEFT JOIN issue_count AS ic ON (ic.question_id = q.id)
WHERE
  q.course_id = $course_id
  AND q.qid = $qid
  AND q.deleted_at IS NULL;

-- BLOCK search_shared_questions
SELECT
  to_jsonb(q.*) AS question,
  to_jsonb(top.*) AS topic,
  to_jsonb(c.*) AS course,
  0 AS open_issue_count,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          to_jsonb(t.*)
          ORDER BY
            t.name
        )
      FROM
        tags AS t
        JOIN question_tags AS qt ON qt.tag_id = t.id
      WHERE
        qt.question_id = q.id
    ),
    '[]'::jsonb
  ) AS tags
FROM
  questions AS q
  JOIN topics AS top ON top.id = q.topic_id
  JOIN sharing_set_questions AS ssq ON q.id = ssq.question_id
  JOIN sharing_sets AS ss ON ssq.sharing_set_id = ss.id
  JOIN sharing_set_courses AS ssc ON ss.id = ssc.sharing_set_id
  JOIN courses AS c ON c.id = ss.course_id
WHERE
  ssc.course_id = $course_id
  AND c.sharing_name = $sharing_name
  AND q.qid = $qid
  AND c.example_course IS FALSE
  AND q.deleted_at IS NULL
UNION
SELECT
  to_jsonb(q.*) AS question,
  to_jsonb(top.*) AS topic,
  to_jsonb(c.*) AS course,
  0 AS open_issue_count,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          to_jsonb(t.*)
          ORDER BY
            t.name
        )
      FROM
        tags AS t
        JOIN question_tags AS qt ON qt.tag_id = t.id
      WHERE
        qt.question_id = q.id
    ),
    '[]'::jsonb
  ) AS tags
FROM
  questions AS q
  JOIN topics AS top ON top.id = q.topic_id
  JOIN courses AS c ON c.id = q.course_id
WHERE
  q.share_publicly
  AND c.sharing_name = $sharing_name
  AND q.qid = $qid
  AND c.example_course IS FALSE
  AND q.deleted_at IS NULL;
