-- BLOCK select_access_control_for_assessment
SELECT
  ac.*,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          jsonb_build_object('access_control_id', ed.access_control_id, 'id', ed.id, 'date', ed.date, 'credit', ed.credit)
          ORDER BY
            ed.date
        )
      FROM
        access_control_early_deadline ed
      WHERE
        ed.access_control_id = ac.id
    ),
    '[]'::jsonb
  ) AS early_deadlines,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          jsonb_build_object('access_control_id', ld.access_control_id, 'id', ld.id, 'date', ld.date, 'credit', ld.credit)
          ORDER BY
            ld.date
        )
      FROM
        access_control_late_deadline ld
      WHERE
        ld.access_control_id = ac.id
    ),
    '[]'::jsonb
  ) AS late_deadlines,
  COALESCE(
    (
      SELECT
        jsonb_agg(
          jsonb_build_object('access_control_id', pe.access_control_id, 'id', pe.id, 'uuid', pe.uuid, 'read_only', pe.read_only)
        )
      FROM
        access_control_prairietest_exam pe
      WHERE
        pe.access_control_id = ac.id
    ),
    '[]'::jsonb
  ) AS prairietest_exams,
  COALESCE(
    (
      SELECT
        jsonb_agg(acg.name ORDER BY acg.name)
      FROM
        access_control_target act
        JOIN access_control_groups acg ON acg.id = act.target_id
      WHERE
        act.access_control_id = ac.id
        AND act.target_type = 'group'
    ),
    '[]'::jsonb
  ) AS targets
FROM
  access_control ac
WHERE
  ac.assessment_id = $assessment_id
ORDER BY
  ac.order;
