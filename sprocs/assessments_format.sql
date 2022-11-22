CREATE FUNCTION
    assessments_format(
        assessment_id bigint
    ) RETURNS JSONB
AS $$
SELECT
    JSONB_BUILD_OBJECT(
        'label', aset.abbreviation || a.number,
        'assessment_id', a.id,
        'color', aset.color
    )
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.id = assessment_id;
$$ LANGUAGE SQL VOLATILE;
