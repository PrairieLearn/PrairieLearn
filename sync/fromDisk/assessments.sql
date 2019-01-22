-- BLOCK insert_assessment
INSERT INTO assessments
        (uuid,  tid,  type,  number,  order_by,  title,  config,  multiple_instance,  shuffle_questions,
         max_points,  auto_close, deleted_at, course_instance_id,  text,
         assessment_set_id,
         constant_question_value, allow_issue_reporting, generated_assessment_sd_reduction_feature_enabled)
(
    SELECT
        $uuid, $tid, $type, $number, $order_by, $title, $config, $multiple_instance, $shuffle_questions,
        $max_points, $auto_close, NULL,      $course_instance_id, $text,
        COALESCE((SELECT id FROM assessment_sets WHERE name = $set_name AND course_id = $course_id), NULL),
        $constant_question_value, $allow_issue_reporting, $generated_assessment_sd_reduction_feature_enabled
)
ON CONFLICT (uuid) DO UPDATE
SET
    tid = EXCLUDED.tid,
    type = EXCLUDED.type,
    number = EXCLUDED.number,
    order_by = EXCLUDED.order_by,
    title = EXCLUDED.title,
    config = EXCLUDED.config,
    multiple_instance = EXCLUDED.multiple_instance,
    shuffle_questions = EXCLUDED.shuffle_questions,
    auto_close = EXCLUDED.auto_close,
    max_points = EXCLUDED.max_points,
    deleted_at = EXCLUDED.deleted_at,
    text = EXCLUDED.text,
    assessment_set_id = EXCLUDED.assessment_set_id,
    constant_question_value = EXCLUDED.constant_question_value,
    allow_issue_reporting = EXCLUDED.allow_issue_reporting,
    generated_assessment_sd_reduction_feature_enabled = EXCLUDED.generated_assessment_sd_reduction_feature_enabled
WHERE
    assessments.course_instance_id = $course_instance_id
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

-- BLOCK select_exams_by_uuid
SELECT * FROM exams
WHERE uuid = $exam_uuid;

-- BLOCK insert_assessment_access_rule
INSERT INTO assessment_access_rules
        (assessment_id,  number,  mode,  role,  credit,  uids,          time_limit_min,
        password,   seb_config,  exam_uuid,
        start_date,
        end_date)
(
    SELECT
        $assessment_id, $number, $mode, $role, $credit, $uids::TEXT[], $time_limit_min,
        $password, $seb_config, $exam_uuid,
        input_date($start_date, ci.display_timezone),
        input_date($end_date, ci.display_timezone)
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE
        a.id = $assessment_id
)
ON CONFLICT (number, assessment_id) DO UPDATE
SET
    mode = EXCLUDED.mode,
    role = EXCLUDED.role,
    credit = EXCLUDED.credit,
    time_limit_min = EXCLUDED.time_limit_min,
    password = EXCLUDED.password,
    exam_uuid = EXCLUDED.exam_uuid,
    uids = EXCLUDED.uids,
    seb_config = EXCLUDED.seb_config,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date;

-- BLOCK delete_excess_assessment_access_rules
DELETE FROM assessment_access_rules
WHERE
    assessment_id = $assessment_id
    AND number > $last_number;

-- BLOCK insert_zone
INSERT INTO zones ( assessment_id,  number,  title,  max_points, number_choose, best_questions)
VALUES            ($assessment_id, $number, $title, $max_points, $number_choose, $best_questions)
ON CONFLICT (number, assessment_id) DO UPDATE
SET
    title = EXCLUDED.title,
    max_points = EXCLUDED.max_points,
    number_choose = EXCLUDED.number_choose,
    best_questions = EXCLUDED.best_questions
RETURNING id;

-- BLOCK delete_excess_zones
DELETE FROM zones
WHERE
    assessment_id = $assessment_id
    AND number > $last_number;

-- BLOCK insert_alternative_group
INSERT INTO alternative_groups
    (number, number_choose, assessment_id, zone_id)
VALUES
    ($number, $number_choose, $assessment_id, $zone_id)
ON CONFLICT (number, assessment_id) DO UPDATE
SET
    number_choose = EXCLUDED.number_choose,
    zone_id = EXCLUDED.zone_id
RETURNING id;

-- BLOCK delete_excess_alternative_groups
DELETE FROM alternative_groups
WHERE
    assessment_id = $assessment_id
    AND ((number < 1) OR (number > $last_number));

-- BLOCK soft_delete_unused_assessment_questions_in_assessment
UPDATE assessment_questions AS aq
SET
    deleted_at = CURRENT_TIMESTAMP
WHERE
    aq.assessment_id = $assessment_id
    AND aq.deleted_at IS NULL
    AND aq.id NOT IN (SELECT unnest($keep_assessment_question_ids::integer[]));

-- BLOCK select_question_by_qid
SELECT id FROM questions AS q
WHERE
    q.qid = $qid
    AND q.course_id = $course_id
    AND q.deleted_at IS NULL;

-- BLOCK insert_assessment_question
INSERT INTO assessment_questions AS aq
    (number, max_points, init_points, points_list, force_max_points, tries_per_variant, deleted_at,  assessment_id, question_id, alternative_group_id, number_in_alternative_group)
VALUES
    ($number, $max_points, $init_points, $points_list::double precision[], $force_max_points, $tries_per_variant, NULL, $assessment_id, $question_id, $alternative_group_id, $number_in_alternative_group)
ON CONFLICT (question_id, assessment_id) DO UPDATE
SET
    number = EXCLUDED.number,
    max_points = EXCLUDED.max_points,
    points_list = EXCLUDED.points_list,
    init_points = EXCLUDED.init_points,
    force_max_points = EXCLUDED.force_max_points,
    tries_per_variant = EXCLUDED.tries_per_variant,
    deleted_at = EXCLUDED.deleted_at,
    alternative_group_id = EXCLUDED.alternative_group_id,
    number_in_alternative_group = EXCLUDED.number_in_alternative_group,
    question_id = EXCLUDED.question_id
RETURNING aq.id;
