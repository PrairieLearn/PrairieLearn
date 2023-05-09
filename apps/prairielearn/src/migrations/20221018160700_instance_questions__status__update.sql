UPDATE instance_questions iq
SET
  status = 'incorrect'
WHERE
  iq.status = 'saved'
  AND CARDINALITY(iq.variants_points_list) > 0
  AND iq.modified_at > now() - interval '3 months'
  AND (
    SELECT
      s.graded_at
    FROM
      variants v
      LEFT JOIN submissions s ON (s.variant_id = v.id)
    WHERE
      v.instance_question_id = iq.id
    ORDER BY
      s.date DESC
    LIMIT
      1
  ) IS NOT NULL
RETURNING
  iq.*;
