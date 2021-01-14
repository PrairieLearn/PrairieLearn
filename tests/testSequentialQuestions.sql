-- BLOCK select_sequential_exam
SELECT
    a.id
FROM
    assessments AS a
WHERE
    a.uuid = 'd7bcc376-4f23-41d6-9f71-87dd1d23991b';

-- BLOCK select_locked_question
SELECT
    iq.id
FROM
    instance_questions iq
    JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
    JOIN questions q ON (q.id = aq.question_id)
WHERE
    q.qid = 'partialCredit2';
