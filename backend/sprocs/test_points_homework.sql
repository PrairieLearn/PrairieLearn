
CREATE OR REPLACE FUNCTION
    test_points_homework(
        IN test_instance_id INTEGER,
        IN credit INTEGER,
        OUT points DOUBLE PRECISION,
        OUT score_perc INTEGER
    ) AS $$
DECLARE
    total_points DOUBLE PRECISION;
    max_points DOUBLE PRECISION;
    current_score_perc INTEGER;
BEGIN
    SELECT sum(iq.points) INTO total_points
    FROM
        instance_questions AS iq
        JOIN test_questions AS tq ON (tq.id = iq.test_question_id)
    WHERE
        iq.test_instance_id = test_points_homework.test_instance_id
        AND tq.deleted_at IS NULL;

    SELECT COALESCE(ti.max_points, t.max_points) INTO max_points
    FROM
        test_instances AS ti
        JOIN tests AS t ON (t.id = ti.test_id)
    WHERE
        ti.id = test_instance_id;

    SELECT ti.score_perc INTO current_score_perc FROM test_instances AS ti WHERE ti.id = test_instance_id;

    -- compute the score in points, maxing out at max_score
    points := least(total_points, max_points);

    -- compute the score as a percentage, applying credit bonus/limits
    score_perc := floor(points / max_points * 100);
    IF credit < 100 THEN
        score_perc := least(score_perc, credit);
    ELSIF (credit > 100) AND (points = max_points) THEN
        score_perc := credit;
    END IF;
    score_perc := greatest(score_perc, current_score_perc);

    RETURN;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
