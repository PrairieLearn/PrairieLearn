-- BLOCK get_data_for_assessment
WITH
  assessment AS (
    SELECT
      id
    FROM
      assessments
    WHERE
      tid = $tid
  ),
  assessment_data AS (
    SELECT
      to_jsonb(assessments) AS assessment
    FROM
      assessments,
      assessment
    WHERE
      assessments.id = assessment.id
  ),
  zones_data AS (
    SELECT
      coalesce(
        jsonb_agg(
          to_jsonb(zones)
          ORDER BY
            number
        ),
        '[]'::jsonb
      ) AS zones
    FROM
      zones,
      assessment
    WHERE
      assessment_id = assessment.id
  ),
  alternative_groups_data AS (
    SELECT
      coalesce(
        jsonb_agg(
          to_jsonb(alternative_groups)
          ORDER BY
            number
        ),
        '[]'::jsonb
      ) AS alternative_groups
    FROM
      alternative_groups,
      assessment
    WHERE
      assessment_id = assessment.id
  ),
  assessment_questions_data AS (
    SELECT
      coalesce(
        jsonb_agg(
          jsonb_set(
            to_jsonb(assessment_questions),
            '{question}'::text[],
            to_jsonb(questions)
          )
          ORDER BY
            assessment_questions.number
        ),
        '[]'::jsonb
      ) AS assessment_questions
    FROM
      assessment_questions,
      assessment,
      questions
    WHERE
      assessment_questions.assessment_id = assessment.id
      AND questions.id = assessment_questions.question_id
  )
SELECT
  assessment,
  zones,
  alternative_groups,
  assessment_questions
FROM
  assessment_data,
  zones_data,
  alternative_groups_data,
  assessment_questions_data;

-- BLOCK insert_pt_exam
INSERT INTO
  pt_exams (uuid)
VALUES
  ($uuid);
