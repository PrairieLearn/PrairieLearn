-- load import data into a temporary table
DROP TABLE IF EXISTS test_instances_import;
CREATE TABLE test_instances_import (
    date TIMESTAMP WITH TIME ZONE,
    uid VARCHAR(255),
    tid VARCHAR(255),
    tiid VARCHAR(255),
    number INTEGER,
    score DOUBLE PRECISION,
    score_perc INTEGER,
    finish_date TIMESTAMP WITH TIME ZONE,
    grading_dates JSONB
);
COPY test_instances_import (date, uid, tid, tiid, number, score, score_perc, finish_date, grading_dates)
FROM '/tmp/test_instances.csv' WITH (FORMAT CSV);

-- create new test_instances from imported data
INSERT INTO test_instances (tiid, date, number, test_id, user_id, auth_user_id)
(
    SELECT tii.tiid, tii.date, tii.number, t.id, u.id, u.id
    FROM test_instances_import AS tii
    LEFT JOIN users AS u ON (u.uid = tii.uid)
    LEFT JOIN (
        SELECT t.id,t.tid,ci.course_id
        FROM tests AS t
        JOIN course_instances AS ci ON (ci.id = t.course_instance_id)
    ) AS t ON (t.tid = tii.tid AND t.course_id = 1)
)
ON CONFLICT DO NOTHING;

-- create new test_states from imported data
-- first make an "open" test_state for every test instance
INSERT INTO test_states (date, open, test_instance_id, auth_user_id)
(
    SELECT tii.date, TRUE, ti.id, u.id
    FROM test_instances_import AS tii
    JOIN users AS u ON (u.uid = tii.uid)
    JOIN test_instances AS ti ON (ti.tiid = tii.tiid)
)
ON CONFLICT DO NOTHING;
-- also make "closed" test states for tests with a finish_date
INSERT INTO test_states (date, open, test_instance_id, auth_user_id)
(
    SELECT tii.finish_date, FALSE, ti.id, u.id
    FROM test_instances_import AS tii
    JOIN users AS u ON (u.uid = tii.uid)
    JOIN test_instances AS ti ON (ti.tiid = tii.tiid)
    WHERE tii.finish_date IS NOT NULL
)
ON CONFLICT DO NOTHING;

-- create test_scores for imported data
-- this is somewhat lossy, because we can't perfectly reconstruct all information
-- and so we aren't trying too hard
INSERT INTO test_scores (date, points, max_points, score_perc, test_instance_id, auth_user_id)
(
    SELECT tii.finish_date, tii.score, NULL, tii.score_perc, ti.id, u.id
    FROM test_instances_import AS tii
    JOIN users AS u ON (u.uid = tii.uid)
    JOIN test_instances AS ti ON (ti.tiid = tii.tiid)
    JOIN tests AS t ON (t.id = ti.test_id)
)
ON CONFLICT DO NOTHING;
