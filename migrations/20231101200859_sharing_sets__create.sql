CREATE TABLE IF NOT EXISTS sharing_sets (
    id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    name text,
    description text,
    UNIQUE (course_id, name)
);

CREATE TABLE IF NOT EXISTS sharing_set_questions (
    id BIGSERIAL PRIMARY KEY,
    sharing_set_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    UNIQUE(sharing_set_id, question_id)
);

ALTER TABLE sharing_set_questions
ADD CONSTRAINT sharing_set_questions_question_id_fkey
FOREIGN KEY (question_id) REFERENCES questions(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE sharing_set_questions
ADD CONSTRAINT sharing_set_questions_sharing_set_id_fkey
FOREIGN KEY (sharing_set_id) REFERENCES sharing_sets(id) ON UPDATE CASCADE ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS sharing_set_courses (
    id BIGSERIAL PRIMARY KEY,
    sharing_set_id BIGINT NOT NULL REFERENCES sharing_sets ON DELETE CASCADE ON UPDATE CASCADE,
    course_id BIGINT NOT NULL REFERENCES pl_courses ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE(sharing_set_id, course_id)
);

ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_name text;
ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS sharing_id text;
ALTER TABLE pl_courses ADD COLUMN IF NOT EXISTS question_sharing_enabled boolean default false;
