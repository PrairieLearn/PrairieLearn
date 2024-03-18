-- BLOCK select_assessments
SELECT
  a.id
FROM
  assessments AS a
WHERE
  EXISTS (
    SELECT
      *
    FROM
      assessment_instances AS ai
    WHERE
      (ai.assessment_id = a.id)
      AND (ai.modified_at > a.stats_last_updated)
  );
