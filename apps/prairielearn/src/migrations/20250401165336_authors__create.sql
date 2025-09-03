CREATE TABLE IF NOT EXISTS authors (
  id BIGSERIAL PRIMARY KEY,
  author_name TEXT,
  orcid  VARCHAR(16),
  email VARCHAR(255),
  sharing_set_id BIGINT REFERENCES sharing_sets(id) ON UPDATE CASCADE ON DELETE CASCADE, 
  UNIQUE NULLS NOT DISTINCT (author_name, orcid, email, sharing_set_id)
);

CREATE TABLE IF NOT EXISTS question_authors (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES authors(id) ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (question_id, author_id)
);
