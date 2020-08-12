-- BLOCK select_exam9
SELECT
    a.id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.course_instance_id = 1
    AND aset.abbreviation = 'E'
    AND a.number = '9';

-- BLOCK select_question4
SELECT
    iq.id
FROM
    instance_questions iq
    JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
    JOIN questions q ON (q.id = aq.question_id)
WHERE
    q.qid = 'partialCredit2';
