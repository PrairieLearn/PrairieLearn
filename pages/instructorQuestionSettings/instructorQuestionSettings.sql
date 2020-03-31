-- BLOCK qids
SELECT
    array_agg(q.qid) AS qids
FROM
    questions AS q
WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL;

-- BLOCK select_question_id_from_uuid
SELECT
    q.id AS question_id
FROM
    questions AS q
WHERE
    q.uuid = $uuid
    AND q.course_id = $course_id
    AND q.deleted_at IS NULL;

-- BLOCK select_assessments_with_question_for_display
SELECT
    jsonb_agg(jsonb_build_object(
        'title', result.course_title,
        'course_instance_id', result.course_instance_id,
        'assessments', result.matched_assessments
    )) AS assessments_from_question_id
FROM
    (
        SELECT
            ci.short_name AS course_title,
            ci.id AS course_instance_id,
            jsonb_agg(jsonb_build_object(
                'label', aset.abbreviation || a.number,
                'assessment_id', a.id,
                'color', aset.color
            ) ORDER BY admin_assessment_question_number(aq.id)) AS matched_assessments
        FROM
            assessment_questions AS aq
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
            JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        WHERE
            aq.question_id = $question_id
            AND aq.deleted_at IS NULL
            AND a.deleted_at IS NULL
            AND ci.deleted_at IS NULL
        GROUP BY
            ci.id
    ) result;

-- BLOCK insert_file_transfer
INSERT INTO file_transfers
    (user_id,  from_course_id,  from_filename,  to_course_id,  storage_filename,  transfer_type)
SELECT
    $user_id, $from_course_id, $from_filename, $to_course_id, $storage_filename, $transfer_type
RETURNING
    file_transfers.id;
