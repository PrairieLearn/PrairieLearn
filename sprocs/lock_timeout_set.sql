CREATE OR REPLACE FUNCTION
    lock_timeout_set(
        timeout integer
    ) RETURNS void
AS $$
BEGIN
    /* Default to never time out */
    EXECUTE 'SET LOCAL lock_timeout TO ' || quote_literal(coalesce(timeout, 0));
END;
$$ LANGUAGE plpgsql VOLATILE;
