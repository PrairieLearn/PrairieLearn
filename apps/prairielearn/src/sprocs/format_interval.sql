CREATE FUNCTION format_interval(d interval) RETURNS text AS $$
    WITH parts AS (
        SELECT
            div(CAST(floor(DATE_PART('epoch', d)) AS integer), 60 * 60 * 24)     AS days,
            mod(div(CAST(floor(DATE_PART('epoch', d)) AS integer), 60 * 60), 24) AS hours,
            mod(div(CAST(floor(DATE_PART('epoch', d)) AS integer), 60), 60)      AS mins,
            mod(CAST(floor(DATE_PART('epoch', d)) AS integer), 60)               AS secs
    )
    SELECT
        CASE
            WHEN days > 0 THEN days::text || 'd ' || hours::text || 'h ' || mins::text || 'm'
            WHEN hours > 0 THEN hours::text || 'h ' || mins::text || 'm'
            WHEN mins > 0 THEN mins::text || 'm'
            ELSE secs::text || 's'
        END
    FROM parts;
$$ LANGUAGE SQL IMMUTABLE;
