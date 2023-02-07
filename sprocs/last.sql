-- Create a function that always returns the last non-NULL item
CREATE FUNCTION last_agg ( anyelement, anyelement )
RETURNS anyelement LANGUAGE SQL IMMUTABLE STRICT AS $$
        SELECT $2;
$$;

-- And then wrap an aggregate around it
CREATE AGGREGATE LAST (
        sfunc    = last_agg,
        basetype = anyelement,
        stype    = anyelement
);
