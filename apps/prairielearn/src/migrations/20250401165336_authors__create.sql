CREATE TABLE IF NOT EXISTS authors (
  id BIGSERIAL PRIMARY KEY,
  author_name VARCHAR(255),
  orcid VARCHAR(16),
  email VARCHAR(255),
  origin_course BIGINT REFERENCES pl_courses (id) ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE NULLS NOT DISTINCT (author_name, orcid, email, origin_course)
);

CREATE TABLE IF NOT EXISTS question_authors (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES authors (id) ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (question_id, author_id)
);
