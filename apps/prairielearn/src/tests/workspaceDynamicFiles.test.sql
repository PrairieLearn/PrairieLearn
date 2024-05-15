-- BLOCK select_test_question
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.qid = $qid;

-- BLOCK select_issues_for_variant_id
SELECT
  *
FROM
  issues
WHERE
  variant_id = $variant_id;
