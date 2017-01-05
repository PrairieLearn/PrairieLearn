-- BLOCK insert_tag
INSERT INTO tags
        (name,  number,  color,  description,  course_id)
VALUES ($name, $number, $color, $description, $course_id)
ON CONFLICT (name, course_id) DO UPDATE
SET
    number = EXCLUDED.number,
    color = EXCLUDED.color,
    description = EXCLUDED.description
RETURNING id;

-- BLOCK delete_unused_tags
DELETE FROM tags AS t
WHERE
    t.course_id = $course_id
    AND t.id NOT IN (SELECT unnest($keep_tag_ids::integer[]));

-- BLOCK insert_question_tag
INSERT INTO question_tags
        (question_id,  tag_id,  number)
VALUES ($question_id, $tag_id, $number)
ON CONFLICT (question_id, tag_id) DO UPDATE
SET
    number = EXCLUDED.number
RETURNING id;

-- BLOCK delete_unused_question_tags
DELETE FROM question_tags AS qi
WHERE
    qi.question_id = $question_id
    AND qi.id NOT IN (SELECT unnest($keep_question_tag_ids::integer[]));
