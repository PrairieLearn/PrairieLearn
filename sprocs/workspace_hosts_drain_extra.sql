CREATE OR REPLACE FUNCTION
    workspace_hosts_drain_extra(
        IN surplus integer
    )
AS $$
BEGIN
    -- Grab a random assortment of extra hosts
    SELECT *
    INTO TEMPORARY TABLE extra
    FROM workspace_hosts AS wh
    WHERE wh.state = 'ready'
    ORDER BY random()
    LIMIT surplus;

    -- Drain them (this sounds ominous :-))
    UPDATE workspace_hosts AS wh
    SET wh.state = 'draining'
    WHERE EXISTS(
        SELECT 1
        FROM extra AS e
        WHERE wh.id = e.id
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
