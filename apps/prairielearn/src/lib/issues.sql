-- BLOCK insert_issue_for_variant
WITH
  variant_data AS (
    SELECT
      c.id AS course_id,
      ci.id AS course_instance_id,
      q.id AS question_id,
      a.id AS assessment_id,
      iq.id AS instance_question_id
    FROM
      variants AS v
      JOIN questions AS q ON (q.id = v.question_id)
      JOIN pl_courses AS c ON (c.id = v.course_id)
      LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
      LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
      LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
      LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
      v.id = $variant_id
  )
INSERT INTO
  issues (
    student_message,
    instructor_message,
    course_caused,
    manually_reported,
    course_data,
    system_data,
    authn_user_id,
    user_id,
    course_id,
    course_instance_id,
    question_id,
    assessment_id,
    instance_question_id,
    variant_id
  )
SELECT
  $student_message,
  $instructor_message,
  $course_caused,
  $manually_reported,
  $course_data,
  $system_data,
  $authn_user_id,
  $user_id,
  course_id,
  course_instance_id,
  question_id,
  assessment_id,
  instance_question_id,
  $variant_id
FROM
  variant_data AS vd;
