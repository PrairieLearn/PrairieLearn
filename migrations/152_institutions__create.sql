CREATE TABLE institutions (
    id bigserial PRIMARY KEY,
    institution TEXT NOT NULL,
    uid_pattern TEXT
);

CREATE INDEX IF NOT EXISTS institutions_institution_idx ON institutions(institution);

INSERT INTO institutions (id, institution, uid_pattern) VALUES
    (1, 'UIUC', '%@illinois.edu'),
    (2, 'ZJUI', '%@intl.zju.edu.cn'),
    (3, 'gvsu.edu', '%@mail.gvsu.edu');

ALTER TABLE pl_courses ADD COLUMN institution_id bigint REFERENCES institutions(id) ON UPDATE CASCADE ON DELETE SET NULL;
UPDATE pl_courses SET institution_id=1;
