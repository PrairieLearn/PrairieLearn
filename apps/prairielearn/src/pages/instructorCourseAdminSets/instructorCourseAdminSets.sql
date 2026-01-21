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
            ci.short_name
          )
          ORDER BY
            ci.id DESC,
            a.order_by,
            a.id
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
