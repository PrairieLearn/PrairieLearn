WITH
  instance_questions_to_update AS (
    SELECT
      iq.id,
      aq.points_list AS new_points_list_original,
      to_jsonb(iq.*) AS old_state
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
      iq.points_list_original IS NULL
      AND aq.points_list IS NOT NULL
  ),
  updated_instance_questions AS (
    UPDATE instance_questions AS iq
    SET
      points_list_original = iqtu.new_points_list_original
    FROM
      instance_questions_to_update AS iqtu
    WHERE
      iq.id = iqtu.id
    RETURNING
      iq.id,
      iq.assessment_instance_id,
      to_jsonb(iq.*) AS new_state
  )
INSERT INTO
  audit_logs (
    table_name,
    column_name,
    action,
    row_id,
    course_id,
    course_instance_id,
    user_id,
    parameters,
    old_state,
    new_state
  )
SELECT
  'instance_questions',
  'points_list_original',
  'update',
  uiq.id,
  c.id,
  ci.id,
  u.user_id,
  jsonb_build_object(
    'called_by',
    '091_instance_questions__points_list_original__update.sql',
    'new_points_list_original',
    iqtu.new_points_list_original
  ),
  iqtu.old_state,
  uiq.new_state
FROM
  instance_questions_to_update AS iqtu
  JOIN updated_instance_questions AS uiq ON (uiq.id = iqtu.id)
  JOIN assessment_instances AS ai on (ai.id = uiq.assessment_instance_id)
  JOIN users AS u ON (u.user_id = ai.user_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id);
