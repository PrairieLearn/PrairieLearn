CREATE TABLE IF NOT EXISTS question_tags (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES questions ON DELETE CASCADE ON UPDATE CASCADE,
    tag_id BIGINT NOT NULL REFERENCES tags ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    UNIQUE (question_id, tag_id)
);

CREATE INDEX IF NOT EXISTS question_tags_tag_id_idx ON question_tags (tag_id);
