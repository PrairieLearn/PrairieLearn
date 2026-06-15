DO $$
DECLARE
    iq RECORD;
    new_variants_points_list DOUBLE PRECISION[];
BEGIN
    FOR iq IN SELECT * FROM instance_questions LOOP
        IF (iq.points > 0) AND (cardinality(iq.variants_points_list) = 0) THEN
            new_variants_points_list := array_append(iq.variants_points_list, iq.points);
            UPDATE instance_questions SET variants_points_list = new_variants_points_list WHERE id = iq.id;
        END IF;
    END LOOP;
END;
$$;
