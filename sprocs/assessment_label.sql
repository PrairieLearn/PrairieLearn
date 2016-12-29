CREATE OR REPLACE FUNCTION
    assessment_label(
        a assessments,
        aset assessment_sets
    ) RETURNS text
AS $$
DECLARE
    label text;
BEGIN
    label := aset.abbrev || a.number;
    RETURN label;
END;
$$ LANGUAGE PLPGSQL;
