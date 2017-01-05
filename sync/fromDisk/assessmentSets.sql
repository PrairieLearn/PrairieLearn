-- BLOCK insert_assessment_set
INSERT INTO assessment_sets
        (abbreviation,  name,  heading,  color,  number,  course_id)
VALUES ($abbreviation, $name, $heading, $color, $number, $course_id)
ON CONFLICT (name, course_id) DO UPDATE
SET
    abbreviation = EXCLUDED.abbreviation,
    heading = EXCLUDED.heading,
    color = EXCLUDED.color,
    number = EXCLUDED.number;

-- BLOCK delete_excess_assessment_sets
DELETE FROM assessment_sets
WHERE
    course_id = $course_id
    AND number > $last_number;
