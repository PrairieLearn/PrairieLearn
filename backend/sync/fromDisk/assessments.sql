-- BLOCK insert
INSERT INTO assessments
    (tid, type, number, title, config, multiple_instance, shuffle_questions,
    max_points, deleted_at, course_instance_id, assessment_set_id)
(SELECT * FROM
    (VALUES ($tid, $type::enum_assessment_type, $number, $title, $config::JSONB, $multiple_instance::BOOLEAN,
        $shuffle_questions::BOOLEAN, $max_score::DOUBLE PRECISION, NULL::timestamp with time zone,
        $course_instance_id::INTEGER)) AS vals,
    (SELECT COALESCE((SELECT id FROM assessment_sets WHERE name = $set_name AND course_id = $course_id), NULL)) AS assessment_sets
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
    assessment_set_id = EXCLUDED.assessment_set_id
RETURNING id;
