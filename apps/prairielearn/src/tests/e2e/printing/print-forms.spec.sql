-- BLOCK select_record_counts
SELECT
  (
    SELECT
      count(*)::integer
    FROM
      assessment_instances
  ) AS assessment_instances,
  (
    SELECT
      count(*)::integer
    FROM
      instance_questions
  ) AS instance_questions,
  (
    SELECT
      count(*)::integer
    FROM
      variants
  ) AS variants;
