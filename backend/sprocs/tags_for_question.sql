
-- Returns a JSON array describing the tags for question in_question_id.

CREATE OR REPLACE FUNCTION
    tags_for_question (in_question_id integer) RETURNS JSONB AS $$
SELECT
    JSONB_AGG(JSONB_BUILD_OBJECT(
        'label',tag.name,
        'id',tag.id,
        'color',tag.color
    ) ORDER BY tag.number)
FROM
    tags AS tag
    JOIN question_tags AS qt ON (qt.tag_id = tag.id AND qt.question_id = in_question_id)
$$ LANGUAGE SQL;
