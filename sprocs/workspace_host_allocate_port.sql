CREATE OR REPLACE FUNCTION
    workspace_host_allocate_port(
        IN instance_id text,
        IN workspace_id bigint,
        OUT port bigint
    )
AS $$
DECLARE
    ports bigint[];
    num_ports bigint;
BEGIN
    -- TODO do we need to add locks to this function to prevent concurrency issues?

    -- get used ports for this host
    ports := ARRAY(
        SELECT w.launch_port
        FROM workspaces AS w
        JOIN workspace_hosts AS wh on w.workspace_host_id = wh.id
        WHERE (w.state = 'launching' OR w.state = 'running')
              AND wh.instance_id = workspace_host_allocate_port.instance_id
              AND w.launch_port IS NOT NULL
              AND w.id != workspace_id
        ORDER BY launch_port ASC
    );
    num_ports := cardinality(ports);

    IF num_ports = 0 OR num_ports IS NULL OR (num_ports > 0 AND ports[1] > 1024) THEN
        -- No used ports, then default to 1024
        port := 1024;
    ELSE
        -- Scan through the used ports to find an opening
        FOR i in 1..num_ports LOOP
            IF i = num_ports THEN
                -- If we're at the end of the array, just use the next port
                port := ports[num_ports] + 1;
            ELSIF (ports[i] + 1) != (ports[i + 1]) THEN
                -- If we have a space between this used port and the next, allocate a port here
                port := ports[i] + 1;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    -- Update the launch port for the workspace
    UPDATE workspaces AS w
    SET launch_port = port
    WHERE w.id = workspace_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
