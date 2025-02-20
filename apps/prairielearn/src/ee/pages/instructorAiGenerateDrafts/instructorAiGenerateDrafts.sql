-- BLOCK select_draft_generation_info_by_course_id
SELECT
  to_jsonb(dqm.*) AS draft_question_metadata,
  q.id AS question_id,
  q.qid,
  u.uid
FROM
  questions AS q
  LEFT JOIN draft_question_metadata AS dqm ON dqm.question_id = q.id
  LEFT JOIN users As u ON u.user_id = dqm.created_by
WHERE
  q.course_id = $course_id
  AND q.draft IS TRUE
  AND q.deleted_at IS NULL
  AND q.qid IS NOT NULL
  -- Source: http://www.rhodiumtoad.org.uk/junk/naturalsort.sql
ORDER BY
  (
    SELECT
      string_agg(
        convert_to(
          coalesce(
            r[2],
            length(length(r[1])::text) || length(r[1])::text || r[1]
          ),
          'SQL_ASCII'
        ),
        '\x00'
      )
    FROM
      regexp_matches(qid, '0*([0-9]+)|([^0-9]+)', 'g') r
  ) ASC,
  -- In case two assessments have the same number, fall back to
  -- lexical ordering by the qid to ensure a stable sort.
  qid ASC;

-- BLOCK select_draft_questions_by_course_id
SELECT
  q.id
FROM
  questions as q
WHERE
  q.course_id = $course_id
  AND q.draft IS TRUE
  AND q.deleted_at IS NULL;

-- BLOCK select_ai_question_generation_prompts_by_course_id
SELECT
  p.*
FROM
  ai_question_generation_prompts AS p
  JOIN questions AS q ON (q.id = p.question_id)
WHERE
  q.course_id = $course_id
ORDER BY
  q.id ASC,
  p.id ASC;
