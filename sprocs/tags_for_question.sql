-- Returns a JSON array describing the tags for question question_id.

CREATE FUNCTION
    tags_for_question (question_id bigint) RETURNS JSONB AS $$
SELECT
    JSONB_AGG(JSONB_BUILD_OBJECT(
        'name',tag.name,
        'id',tag.id,
        'color',tag.color
    ) ORDER BY tag.number, tag.id)
FROM
    tags AS tag
    JOIN question_tags AS qt ON (qt.tag_id = tag.id AND qt.question_id = tags_for_question.question_id)
$$ LANGUAGE SQL STABLE;
