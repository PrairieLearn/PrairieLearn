ALTER TABLE variants ADD COLUMN IF NOT EXISTS course_instance_id bigint REFERENCES course_instances ON UPDATE CASCADE ON DELETE CASCADE;

UPDATE variants AS v
SET
    course_instance_id = ci.id
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    v.instance_question_id = iq.id;
