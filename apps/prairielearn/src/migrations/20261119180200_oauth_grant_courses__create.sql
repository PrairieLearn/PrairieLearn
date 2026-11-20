-- The courses the user picked when approving. A grant reaches no other course.
CREATE TABLE IF NOT EXISTS oauth_grant_courses (
  oauth_grant_id bigint NOT NULL REFERENCES oauth_grants ON UPDATE CASCADE ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES courses ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (oauth_grant_id, course_id)
);

CREATE INDEX IF NOT EXISTS oauth_grant_courses_course_id_idx ON oauth_grant_courses (course_id);
