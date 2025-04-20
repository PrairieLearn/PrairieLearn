-- BLOCK select_assessments_to_auto_close
SELECT
  ai.id,
  ai.open,
  ai.assessment_id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  a.type = 'Exam'
  -- Only consider assessment instances that were modified "recently";
  -- we have an index on `modified_at`, so this lets us avoid doing a
  -- sequential scan on the entire `assessment_instances` table.
  --
  -- "Recently" is defined as twice the `age_minutes` value. This should
  -- ensure that any given assessment instance receives ample attempts
  -- at being finished, even in the unlikely scenario that PrairieLearn
  -- crashes multiple times while trying to finish it.
  --
  -- Note that this relies on the frequency of the `autoFinishExams`
  -- cron job being sufficiently less than `age_minutes`. This is true
  -- by default.
  AND ai.modified_at > CURRENT_TIMESTAMP - make_interval(mins => $age_minutes * 2)
  AND (
    (
      -- Consider assessment instances that have not been modified for
      -- $age_minutes minutes and need to be closed
      ai.open
      AND ai.auto_close
      AND ai.modified_at <= CURRENT_TIMESTAMP - make_interval(mins => $age_minutes)
    )
    OR (
      -- Consider assessment instances that are already closed but that did
      -- not complete the grading process
      ai.open = false
      AND ai.grading_needed
    )
  )
