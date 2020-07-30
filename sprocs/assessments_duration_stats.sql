CREATE OR REPLACE FUNCTION
    assessments_duration_stats (
        IN assessment_id bigint,
        OUT min interval,
        OUT max interval,
        OUT mean interval,
        OUT median interval,
        OUT thresholds interval[],
        OUT threshold_seconds double precision[],
        OUT threshold_labels text[],
        OUT hist integer[]
    )
AS $$
DECLARE
    quartile1 interval;
    quartile2 interval;
    quartile3 interval;
    perc90 interval;
    duration_limit interval;
BEGIN
    -- first pass over assessment_instances: compute basic statistics
    SELECT
        min(duration),
        max(duration),
        avg(duration),
        percentile_disc(0.5) WITHIN GROUP (ORDER BY duration),
        percentile_disc(0.75) WITHIN GROUP (ORDER BY duration),
        percentile_disc(0.9) WITHIN GROUP (ORDER BY duration)
    INTO
        min, max, mean, median, quartile3, perc90
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        LEFT JOIN group_info(assessments_duration_stats.assessment_id) AS gi ON (gi.id = ai.group_id)
        LEFT JOIN group_users AS gu ON (gu.group_id = gi.id)
        JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
        JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
    WHERE
        a.id = assessments_duration_stats.assessment_id
        AND role = 'Student';

    min := coalesce(min, interval '0');
    max := coalesce(max, interval '0');
    mean := coalesce(mean, interval '0');
    median := coalesce(median, interval '0');

    -- figure out the histogram grid
    duration_limit := greatest(quartile3 + 2 * (quartile3 - median), perc90);
    duration_limit := coalesce(duration_limit, interval '10 minutes');
    thresholds := interval_hist_thresholds(duration_limit);
    threshold_seconds := interval_array_to_seconds(thresholds);
    threshold_labels := interval_array_to_strings(thresholds);

    -- second pass over assessment_instances: compute the histogram
    SELECT array_histogram(duration, thresholds)
    INTO hist
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        LEFT JOIN group_info(assessments_duration_stats.assessment_id) AS gi ON (gi.id = ai.group_id)
        LEFT JOIN group_users AS gu ON (gu.group_id = gi.id)
        JOIN users AS u ON (u.user_id = ai.user_id OR u.user_id = gu.user_id)
        JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
    WHERE
        a.id = assessments_duration_stats.assessment_id
        AND role = 'Student';
END;
$$ LANGUAGE plpgsql STABLE;
