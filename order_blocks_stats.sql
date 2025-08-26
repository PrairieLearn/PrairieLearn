-- Step 1: create temp table
CREATE TEMP TABLE tmp_qids (
    course TEXT,
    qid TEXT
);

-- Step 2: load CSV into temp table
COPY tmp_qids (course, qid)
FROM '/PrairieLearn/out.csv'
WITH (FORMAT csv, HEADER true);

-- Step 3: run stats query
WITH matched_questions AS (
    SELECT q.id AS question_id,
           q.course_id,
           c.institution_id
    FROM tmp_qids t
    JOIN pl_courses c ON c.path = t.course
    JOIN questions q ON q.qid = t.qid AND q.course_id = c.id
),
student_attempts AS (
    SELECT DISTINCT iq.authn_user_id, mq.question_id
    FROM matched_questions mq
    JOIN assessment_questions aq ON mq.question_id = aq.question_id
    JOIN instance_questions iq ON iq.assessment_question_id = aq.id
),
all_submissions AS (
    SELECT s.id AS submission_id, mq.question_id
    FROM matched_questions mq
    JOIN assessment_questions aq ON mq.question_id = aq.question_id
    JOIN instance_questions iq ON iq.assessment_question_id = aq.id
    JOIN variants v ON v.instance_question_id = iq.id
    JOIN submissions s ON s.variant_id = v.id
)
SELECT
    COUNT(DISTINCT mq.question_id)    AS num_questions,
    COUNT(DISTINCT sa.authn_user_id)  AS num_students,
    COUNT(DISTINCT mq.course_id)      AS num_courses,
    COUNT(DISTINCT mq.institution_id) AS num_institutions,
    COUNT(DISTINCT asub.submission_id) AS num_submissions
FROM matched_questions mq
LEFT JOIN student_attempts sa ON sa.question_id = mq.question_id
LEFT JOIN all_submissions asub ON asub.question_id = mq.question_id;

-- Step 4: drop temp table (optional)
DROP TABLE tmp_qids;
