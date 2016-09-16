-- BLOCK insert_assessment
INSERT INTO assessments
        (tid,  type,  number,  title,  config,  multiple_instance,  shuffle_questions,
         max_points, deleted_at, course_instance_id,  text,
         assessment_set_id)
(
    SELECT
        $tid, $type, $number, $title, $config, $multiple_instance, $shuffle_questions,
        $max_score,  NULL,      $course_instance_id, $text,
        COALESCE((SELECT id FROM assessment_sets WHERE name = $set_name AND course_id = $course_id), NULL)
)
ON CONFLICT (tid, course_instance_id) DO UPDATE
SET
    type = EXCLUDED.type,
    number = EXCLUDED.number,
    title = EXCLUDED.title,
    config = EXCLUDED.config,
    multiple_instance = EXCLUDED.multiple_instance,
    shuffle_questions = EXCLUDED.shuffle_questions,
    max_points = EXCLUDED.max_points,
    deleted_at = EXCLUDED.deleted_at,
    text = EXCLUDED.text,
    assessment_set_id = EXCLUDED.assessment_set_id
RETURNING id;

-- BLOCK soft_delete_unused_assessments
UPDATE assessments AS a
SET
    deleted_at = CURRENT_TIMESTAMP
WHERE
    a.course_instance_id = $course_instance_id
    AND a.deleted_at IS NULL
    AND a.id NOT IN (SELECT unnest($keep_assessment_ids::integer[]));

-- BLOCK soft_delete_unused_assessment_questions
UPDATE assessment_questions AS aq
SET
    deleted_at = CURRENT_TIMESTAMP
FROM
    assessments AS a
WHERE
    a.id = aq.assessment_id
    AND a.course_instance_id = $course_instance_id
    AND aq.deleted_at IS NULL
    AND a.id NOT IN (SELECT unnest($keep_assessment_ids::integer[]));

-- BLOCK delete_unused_assessment_access_rules
DELETE FROM assessment_access_rules AS tar
WHERE NOT EXISTS (
    SELECT 1 FROM assessments AS a
    WHERE
        a.id = tar.assessment_id
        AND a.deleted_at IS NULL
);

-- BLOCK delete_unused_zones
DELETE FROM zones AS z
WHERE NOT EXISTS (
    SELECT 1 FROM assessments AS a
    WHERE
        a.id = z.assessment_id
        AND a.deleted_at IS NULL
);

-- BLOCK insert_assessment_access_rule
INSERT INTO assessment_access_rules
    ( assessment_id,  number,  mode,  role,  uids,          start_date,  end_date,  credit)
VALUES
    ($assessment_id, $number, $mode, $role, $uids::TEXT[], $start_date, $end_date, $credit)
ON CONFLICT (number, assessment_id) DO UPDATE
SET
    mode = EXCLUDED.mode,
    role = EXCLUDED.role,
    uids = EXCLUDED.uids,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    credit = EXCLUDED.credit;

-- BLOCK delete_excess_assessment_access_rules
DELETE FROM assessment_access_rules
WHERE
    assessment_id = $assessment_id
    AND number > $last_number;

-- BLOCK insert_zone
INSERT INTO zones ( assessment_id,  number,  title)
VALUES            ($assessment_id, $number, $title)
ON CONFLICT (number, assessment_id) DO UPDATE
SET
    title = EXCLUDED.title;

-- BLOCK delete_excess_zones
DELETE FROM zones
WHERE
    assessment_id = $assessment_id
    AND number > $last_number;

-- BLOCK soft_delete_unused_assessment_questions_in_assessment
UPDATE assessment_questions AS aq
SET
    deleted_at = CURRENT_TIMESTAMP
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL
    AND aq.id NOT IN (SELECT unnest($keep_assessment_question_ids::integer[]));

-- BLOCK select_question_by_qid
SELECT id FROM questions
WHERE
    qid = $qid
    AND course_id = $course_id;

-- BLOCK insert_assessment_question
INSERT INTO assessment_questions AS aq
        (number,  max_points,  init_points,  points_list,
        deleted_at,  assessment_id,  question_id, zone_id)
(
    SELECT
        $number, $max_points, $init_points, $points_list::double precision[],
        NULL,       $assessment_id, $question_id, z.id
    FROM
        zones AS z
        JOIN assessments AS a ON (a.id = z.assessment_id)
    WHERE
        a.id = $assessment_id
        AND z.number = $zone_number
)
ON CONFLICT (question_id, assessment_id) DO UPDATE
SET
    number = EXCLUDED.number,
    max_points = EXCLUDED.max_points,
    points_list = EXCLUDED.points_list,
    init_points = EXCLUDED.init_points,
    deleted_at = EXCLUDED.deleted_at,
    zone_id = EXCLUDED.zone_id,
    question_id = EXCLUDED.question_id
RETURNING aq.id;
