-- BLOCK insert_topic
INSERT INTO topics
        (name,  number,  color,  course_id)
VALUES ($name, $number, $color, $course_id)
ON CONFLICT (name, course_id) DO UPDATE
SET
    number = EXCLUDED.number,
    color = EXCLUDED.color
RETURNING id;

-- BLOCK delete_unused_topics
DELETE FROM topics AS top
WHERE
    top.course_id = $course_id
    AND top.id NOT IN (SELECT unnest($keep_topic_ids::integer[]));
