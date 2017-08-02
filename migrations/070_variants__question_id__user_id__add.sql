ALTER TABLE variants ADD COLUMN question_id bigint NOT NULL REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE variants ADD COLUMN user_id bigint NOT NULL REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE variants ALTER COLUMN instance_question_id DROP NOT NULL;

UPDATE variants AS v
SET
    v.question_id = q.id
    v.user_id = u.user_id
FROM
    instances_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
    iq.id = v.instance_question_id;
