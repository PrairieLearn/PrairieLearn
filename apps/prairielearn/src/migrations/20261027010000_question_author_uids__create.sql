-- Legacy authors and question_authors remain intact during the transition.
-- UID rows are populated from course files on the next sync, including fast sync.
CREATE TABLE question_author_uids (
  question_id BIGINT NOT NULL REFERENCES questions (id) ON UPDATE CASCADE ON DELETE CASCADE,
  uid VARCHAR(255) NOT NULL CHECK (uid ~ '[^[:space:]]'),
  PRIMARY KEY (question_id, uid)
);

CREATE INDEX question_author_uids_uid_question_id_idx ON question_author_uids (uid, question_id);
