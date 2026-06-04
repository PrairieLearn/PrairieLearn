-- BLOCK select_assessment_sets
SELECT
  aset.*,
  (
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'assessment_id',
            a.id,
            'tid',
            a.tid,
            'title',
            a.title,
            'label',
            aset.abbreviation || a.number,
            'color',
            aset.color,
            'course_instance_id',
            ci.id,
            'course_instance_short_name',
            ci.short_name,
            'course_instance_long_name',
            ci.long_name
          )
          ORDER BY
            -- Use new publishing dates if available, otherwise fall back to legacy access rules
            COALESCE(
              ci.publishing_start_date,
              (
                SELECT
                  min(ar.start_date)
                FROM
                  course_instance_access_rules AS ar
                WHERE
                  ar.course_instance_id = ci.id
              )
            ) DESC NULLS LAST,
            COALESCE(
              ci.publishing_end_date,
              (
                SELECT
                  max(ar.end_date)
                FROM
                  course_instance_access_rules AS ar
                WHERE
                  ar.course_instance_id = ci.id
              )
            ) DESC NULLS LAST,
            ci.id DESC,
            a.order_by ASC,
            a.id ASC
        ),
        '[]'::jsonb
      )
    FROM
      assessments AS a
      JOIN course_instances AS ci ON a.course_instance_id = ci.id
    WHERE
      a.assessment_set_id = aset.id
      AND a.deleted_at IS NULL
      AND ci.deleted_at IS NULL
  ) AS assessments
FROM
  assessment_sets AS aset
WHERE
  aset.course_id = $course_id
ORDER BY
  aset.number;
