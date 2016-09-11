CREATE OR REPLACE FUNCTION format_interval(d interval) RETURNS text AS $$
    WITH parts AS (
        SELECT
            div(CAST(floor(EXTRACT(EPOCH FROM d)) AS integer), 60 * 60 * 24)     AS days,
            mod(div(CAST(floor(EXTRACT(EPOCH FROM d)) AS integer), 60 * 60), 24) AS hours,
            mod(div(CAST(floor(EXTRACT(EPOCH FROM d)) AS integer), 60), 60)      AS mins
    )
    SELECT
        CASE
            WHEN days > 0 THEN days::text || 'd ' || hours::text || 'h ' || mins::text || 'm'
            WHEN hours > 0 THEN hours::text || 'h ' || mins::text || 'm'
            ELSE mins::text || 'm'
        END
    FROM parts;
$$ LANGUAGE SQL;
