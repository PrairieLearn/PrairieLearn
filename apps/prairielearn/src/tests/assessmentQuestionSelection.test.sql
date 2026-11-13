-- BLOCK select_assessment_question_qids
SELECT
  aq.id,
  q.qid
FROM
  assessment_questions AS aq
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL;

-- BLOCK set_zone_number_choose
UPDATE zones
SET
  number_choose = $number_choose
WHERE
  assessment_id = $assessment_id
  AND number = $zone_number;

-- BLOCK select_instance_assessment_question_ids
SELECT
  assessment_question_id
FROM
  instance_questions
WHERE
  assessment_instance_id = $assessment_instance_id;
