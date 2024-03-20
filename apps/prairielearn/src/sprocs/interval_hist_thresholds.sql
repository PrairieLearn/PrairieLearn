CREATE FUNCTION
    interval_hist_thresholds (duration INTERVAL) RETURNS INTERVAL[] AS $$
    WITH candidates AS (
        SELECT
            step,
            DATE_PART('epoch', greatest(duration, interval '10m'))
                / DATE_PART('epoch', step)
                AS num_steps
        FROM (
            VALUES
                (interval '1m'),
                (interval '2m'),
                (interval '3m'),
                (interval '5m'),
                (interval '10m'),
                (interval '15m'),
                (interval '20m'),
                (interval '30m'),
                (interval '1h'),
                (interval '2h'),
                (interval '3h'),
                (interval '4h'),
                (interval '6h'),
                (interval '12h'),
                (interval '1d'),
                (interval '2d'),
                (interval '3d'),
                (interval '5d'),
                (interval '10d'),
                (interval '15d'),
                (interval '20d'),
                (interval '30d')
        ) AS possible_steps (step)
    ),
    selected AS (
        SELECT
            step,
            CAST(ceiling(num_steps) AS INTEGER) AS num_steps
        FROM candidates
        WHERE num_steps >= 7
        ORDER BY num_steps
        LIMIT 1
    )
    SELECT array_agg(i * step)
    FROM selected,
    generate_series(0, num_steps) AS i
$$ LANGUAGE SQL IMMUTABLE;

CREATE FUNCTION
    interval_array_to_seconds (durations INTERVAL[]) RETURNS DOUBLE PRECISION[] AS $$
    SELECT array_agg(DATE_PART('epoch', d))
    FROM unnest(durations) AS vals (d)
$$ LANGUAGE SQL IMMUTABLE;

CREATE FUNCTION
    interval_array_to_strings (durations INTERVAL[]) RETURNS TEXT[] AS $$
    SELECT array_agg(format_interval_short(d))
    FROM unnest(durations) AS vals (d)
$$ LANGUAGE SQL IMMUTABLE;
