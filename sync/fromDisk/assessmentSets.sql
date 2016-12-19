-- BLOCK insert_assessment_set
INSERT INTO assessment_sets
        (abbrev,  name,  heading,  color,  number,  course_id)
VALUES ($abbrev, $name, $heading, $color, $number, $course_id)
ON CONFLICT (name, course_id) DO UPDATE
SET
    abbrev = EXCLUDED.abbrev,
    heading = EXCLUDED.heading,
    color = EXCLUDED.color,
    number = EXCLUDED.number;

-- BLOCK delete_excess_assessment_sets
DELETE FROM assessment_sets
WHERE
    course_id = $course_id
    AND number > $last_number;
