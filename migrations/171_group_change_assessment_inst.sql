ALTER TABLE assessments ADD COLUMN groupwork boolean DEFAULT FALSE;


CREATE TABLE IF NOT EXISTS group_type(
    id BIGSERIAL PRIMARY KEY,
    assessment_id bigint REFERENCES assessments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    grouptype           INT    NOT NULL,
    max           INT,
    min           INT    NOT NULL,
    UNIQUE (assessment_id)
);
CREATE TABLE IF NOT EXISTS groups(
    id BIGSERIAL PRIMARY KEY     NOT NULL,
    group_name TEXT,
    group_type_id bigint REFERENCES group_type(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS group_user (
  id BIGSERIAL PRIMARY KEY     NOT NULL,
  group_id bigint REFERENCES groups(id) NOT NULL,
  user_id bigint REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE NOT NULL,
  UNIQUE(group_id, user_id)
);
ALTER TABLE assessment_instances ADD COLUMN group_id BIGINT REFERENCES groups ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE assessment_instances ADD CONSTRAINT uniqueGroup UNIQUE (group_id);
ALTER TABLE assessment_instances ADD CONSTRAINT user_group_XOR CHECK ((user_id IS NOT NULL AND group_id is NULL) OR (group_id IS NOT NULL AND user_id is NULL));
ALTER TABLE assessment_instances ALTER COLUMN user_id DROP NOT NULL;