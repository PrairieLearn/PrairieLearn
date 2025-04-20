CREATE FUNCTION
    assessment_instance_label(
        ai assessment_instances,
        a assessments,
        aset assessment_sets
    ) RETURNS text
AS $$
DECLARE
    label text;
BEGIN
    label := aset.abbreviation || a.number;
    IF (a.multiple_instance) THEN
        label := label || '#' || ai.number;
    END IF;
    RETURN label;
END;
$$ LANGUAGE PLPGSQL IMMUTABLE;
