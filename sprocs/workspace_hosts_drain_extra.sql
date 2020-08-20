CREATE OR REPLACE FUNCTION
    workspace_hosts_drain_extra(surplus integer) RETURNS void
AS $$
BEGIN
    -- Grab a random assortment of extra hosts
    CREATE TEMPORARY TABLE extra ON COMMIT DROP AS (
        SELECT *
        FROM workspace_hosts AS wh
        WHERE wh.state = 'ready'
        ORDER BY random()
        LIMIT surplus
    );

    -- Drain them (this sounds ominous :-))
    UPDATE workspace_hosts AS wh
    SET state = 'draining'
    WHERE EXISTS(
        SELECT 1
        FROM extra AS e
        WHERE wh.id = e.id
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
