ALTER TABLE variants
ADD COLUMN question_id bigint REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE variants
ADD COLUMN user_id bigint REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE variants
ALTER COLUMN instance_question_id
DROP NOT NULL;

UPDATE variants AS v
SET
  question_id = q.id,
  user_id = u.user_id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
  iq.id = v.instance_question_id;

ALTER TABLE variants
ALTER COLUMN question_id
SET NOT NULL;

ALTER TABLE variants
ALTER COLUMN user_id
SET NOT NULL;
