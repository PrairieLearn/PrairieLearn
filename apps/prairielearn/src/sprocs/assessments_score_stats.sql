CREATE FUNCTION
    assessments_score_stats (
        IN assessment_id bigint,
        OUT number integer,
        OUT min double precision,
        OUT max double precision,
        OUT mean double precision,
        OUT std double precision,
        OUT median double precision,
        OUT n_zero integer,
        OUT n_hundred integer,
        OUT n_zero_perc double precision,
        OUT n_hundred_perc double precision,
        OUT score_hist integer[]
    )
AS $$
DECLARE
BEGIN
    -- if a student has multiple assessment_instances for this assessment
    -- then use their maximum score
    WITH student_assessment_scores AS (
        SELECT
            max(ai.score_perc) AS score_perc
        FROM
            assessment_instances AS ai
            JOIN assessments AS a ON (a.id = ai.assessment_id)
            LEFT JOIN group_users AS gu ON (gu.group_id = ai.group_id)
            JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
            JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
        WHERE
            a.id = assessments_score_stats.assessment_id
            AND ai.include_in_statistics
        GROUP BY u.user_id
    )
    SELECT
        count(score_perc),
        min(score_perc),
        max(score_perc),
        avg(score_perc),
        stddev_samp(score_perc),
        percentile_disc(0.5) WITHIN GROUP (ORDER BY score_perc),
        count(score_perc <= 0 OR NULL),
        count(score_perc >= 100 OR NULL),
        CAST(count(score_perc <= 0 OR NULL) AS double precision) / greatest(1, count(score_perc)) * 100,
        CAST(count(score_perc >= 100 OR NULL) AS double precision) / greatest(1, count(score_perc)) * 100,
        histogram(score_perc, 0, 100, 10)
    INTO
        number,
        min,
        max,
        mean,
        std,
        median,
        n_zero,
        n_hundred,
        n_zero_perc,
        n_hundred_perc,
        score_hist
    FROM student_assessment_scores;

    number := coalesce(number, 0);
    min := coalesce(min, 0);
    max := coalesce(max, 0);
    mean := coalesce(mean, 0);
    std := coalesce(std, 0);
    median := coalesce(median, 0);
    n_zero := coalesce(n_zero, 0);
    n_hundred := coalesce(n_hundred, 0);
    n_zero_perc := coalesce(n_zero_perc, 0);
    n_hundred_perc := coalesce(n_hundred_perc, 0);
    score_hist := coalesce(score_hist, array_fill(0, ARRAY[10]));
END;
$$ LANGUAGE plpgsql STABLE;
