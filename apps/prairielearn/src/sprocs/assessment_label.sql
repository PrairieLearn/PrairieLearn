CREATE FUNCTION
    assessment_label(
        a assessments,
        aset assessment_sets
    ) RETURNS text
AS $$
DECLARE
    label text;
BEGIN
    label := aset.abbreviation || a.number;
    RETURN label;
END;
$$ LANGUAGE PLPGSQL IMMUTABLE;
